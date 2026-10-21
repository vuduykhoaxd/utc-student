/**
 * Mock API
 *
 * A single module that every feature talks to. Each method simulates network
 * latency and returns detached copies of the data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWAPPING IN THE REAL BACKEND
 * Replace the body of each method with `fetch(...)`. Call sites do not change,
 * because they already consume promises and unwrap nothing themselves.
 *
 *   async function list(params) {
 *     const res = await fetch(`/api/news?${new URLSearchParams(params)}`);
 *     if (!res.ok) throw new ApiError(res.statusText, res.status);
 *     return res.json();
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as db from './db.js';
import { read, write, remove, storageKey } from '../utils/storage.js';
import {
  matches,
  timeAgo,
  normalizeSearch,
  schoolDay,
  minutesBetween,
  addDays,
  startOfDay,
} from '../utils/format.js';
import { termConfig, AVATAR_PALETTES, courses, newsCategories, grades, gradeHistory, gradeScale } from '../data/seed.js';
import * as utcClient from '../api/utc-client.js';

/** Error type every endpoint rejects with. */
export class ApiError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Transport simulation                                                        */
/* -------------------------------------------------------------------------- */

/** Simulated round-trip latency window (ms). */
const LATENCY = [140, 380];

/** Wrap a value in a latency-simulated promise. */
function respond(value, { fail, error, jitter = 1 } = {}) {
  const delay = (LATENCY[0] + Math.random() * (LATENCY[1] - LATENCY[0])) * jitter;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (fail) reject(new ApiError(error, 400, 'VALIDATION'));
      else resolve(value);
    }, delay);
  });
}

/** Shorter latency for local-only reads (typing, polling). */
function respondFast(value) {
  return respond(value, { jitter: 0.35 });
}

/** Local calendar date as `YYYY-MM-DD` (not UTC, so "today" never shifts). */
function localIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in student's id.
 *
 * Read from the stored session so this module stays free of a dependency on
 * app-store (which imports it). The backend puts `id` on the identity, so the
 * authorId written by a post matches the id the server records.
 */
function currentUserId() {
  const session = read('session', null);
  return session?.userId ?? session?.identity?.id ?? null;
}

function requireUser() {
  const id = currentUserId();
  if (!id) throw new ApiError('Bạn chưa đăng nhập.', 401, 'UNAUTHENTICATED');
  return id;
}

/** Decorate a student with derived display fields. */
function decorateStudent(student) {
  if (!student) return null;
  const palette = AVATAR_PALETTES[student.avatarIndex ?? 0];
  return {
    ...student,
    password: undefined,
    initials: initialsOf(student.fullName),
    avatarFrom: palette[0],
    avatarTo: palette[1],
  };
}

/**
 * Avatar initials for a Vietnamese name.
 *
 * Vietnamese names read family-first ("Nguyễn Văn An"), so the initial pair is
 * the *first* and *last* word — "NA" — not the last two, which would give
 * "VA" for the same person.
 */
function initialsOf(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Which demo student a live-authenticated user is mapped onto.
 *
 * Login and identity come from the real backend, but the rest of the app
 * (news, documents, courses, friends…) is still the demo dataset, and those
 * tables are keyed by `studentId` of a demo student. Pinning the signed-in
 * live user to one demo record keeps every demo feature resolving instead of
 * quietly returning nothing.
 */
const LIVE_HOST_ID = 'u1';

/**
 * Fields the portal owns.
 *
 * When signed in for real these come from the school, never from the demo
 * dataset. Any that the portal did not return are forced to null rather than
 * left to fall back — otherwise a stale demo value (a different student's
 * email, say) shows up on a signed-in page and looks like real data.
 */
const PORTAL_OWNED_FIELDS = [
  'email',
  'schoolEmail',
  'faculty',
  'major',
  'cohort',
  'className',
  'phone',
  'birthDate',
  'address',
  'gender',
];

/**
 * The signed-in student, when the session came from the real backend.
 *
 * Cached because `liveProfile` is called on every session restore, and because
 * the local database has no idea the real student exists — it only knows the
 * demo host record.
 *
 * @type {object|null}
 */
let liveStudent = null;

/** Merge a real identity over the demo host record. */
function liveProfile(identity) {
  const host = db.table('students').find((s) => s.id === LIVE_HOST_ID) ?? {};
  const palette = AVATAR_PALETTES[identity.avatarIndex ?? 0];

  /**
   * The id every social write is keyed on.
   *
   * When the backend owns the session it hands us a canonical id, and it MUST
   * win: substituting the demo host's would make posts and messages attributed
   * to a student nobody else can see. The demo id is only the fallback for a
   * session the backend does not recognise.
   */
  const id = identity.id ?? host.id ?? LIVE_HOST_ID;

  const merged = {
    ...host,
    ...identity,
    id,
    studentId: identity.studentId || host.studentId,
    fullName: identity.fullName || host.fullName,
    // Never leak a demo password into a live session.
    password: undefined,
    presence: 'online',
    avatarIndex: identity.avatarIndex ?? host.avatarIndex ?? 0,
    avatarFrom: palette[0],
    avatarTo: palette[1],
  };

  for (const field of PORTAL_OWNED_FIELDS) {
    if (!(field in identity)) merged[field] = null;
  }

  /**
   * Bio belongs to the student, not to the demo host.
   *
   * Spreading `host` above carries the bundled sample profile's bio; a first
   * sign-in would then open with someone else's introduction already written.
   * Start blank and let the student fill it in (or keep the backend's value
   * when it sends one).
   */
  if (!('bio' in identity)) merged.bio = '';

  /**
   * UTC issues every student a mailbox at <studentId>@sv.utc.edu.vn, but only
   * infer it when the portal gave nothing — a wrong address is worse than a
   * blank one.
   */
  if (!merged.schoolEmail && !merged.email && merged.studentId) {
    merged.schoolEmail = `${merged.studentId}@sv.utc.edu.vn`;
  }

  const decorated = decorateStudent(merged);
  liveStudent = decorated;

  return decorated;
}

/**
 * Look a student up, preferring the live session over the bundled dataset.
 *
 * Without this the dashboard and profile keep showing the demo host's name even
 * when a real student is signed in — the local database has no record of them.
 *
 * @param {string} id
 */
function findStudent(id) {
  if (liveStudent && liveStudent.id === id) return liveStudent;
  return db.find('students', id);
}

export const auth = {
  /**
   * Sign in.
   *
   * With `USE_LIVE_API` on this goes to the hosted UTC portal through
   * `scripts/api/utc-client.js`; the local dataset is not consulted at all.
   * Otherwise it falls back to the demo accounts.
   *
   * Registration is intentionally absent — accounts are issued by the school.
   */
  async login({ studentId, password, remember = true }) {
    const code = String(studentId ?? '').trim().replace(/\s+/g, '');
    const pass = String(password ?? '');

    if (!code || !pass) {
      return respond(null, {
        fail: true,
        error: 'Vui lòng nhập đầy đủ mã sinh viên và mật khẩu.',
      });
    }

    /* ---------- Hosted UTC backend ---------- */
    if (utcClient.isLive) {
      try {
        const { identity } = await utcClient.login({
          username: code,
          password: pass,
          remember,
        });

        /**
         * The session pointer must carry the student's own id.
         *
         * Anything that writes a post, a message, or a friendship is keyed on
         * it, so the demo host id must only be a fallback for when the backend
         * has not assigned one yet.
         */
        write('session', {
          userId: identity.id ?? LIVE_HOST_ID,
          live: true,
          identity,
          signedInAt: Date.now(),
          remember,
        });

        return respond(liveProfile(identity));
      } catch (error) {
        return respond(null, { fail: true, error: error.message, code: error.code });
      }
    }

    /* ---------- Demo accounts ---------- */
    const student = db.table('students').find((s) => s.studentId === code);

    if (!student) {
      return respond(null, {
        fail: true,
        error: 'Không tìm thấy mã sinh viên này trong hệ thống.',
      });
    }
    if (student.password !== pass) {
      return respond(null, {
        fail: true,
        error: 'Mật khẩu không chính xác. Vui lòng thử lại.',
      });
    }

    write('session', {
      userId: student.id,
      signedInAt: Date.now(),
      remember: true,
    });

    return respond(decorateStudent(student));
  },

  /** Restore a persisted session on boot. */
  async session() {
    /* ---------- Live session ---------- */
    /**
     * Ask the backend first when it is available.
     *
     * The proxy owns the token under its own storage key, so reading the demo
     * session first would report "signed out" for a browser that is in fact
     * signed in — and then clear the local pointer, losing the session on every
     * reload.
     */
    if (utcClient.isLive && utcClient.restoreSession) {
      try {
        const restored = await utcClient.restoreSession();
        if (!restored) return respondFast(null);
        return respondFast(liveProfile(restored.identity));
      } catch (error) {
        /**
         * Let a transport failure surface.
         *
         * `restoreSession` already handles a rejected token by clearing the
         * session and returning null. Anything reaching here is the backend
         * being unreachable, which is not the same as being signed out — and
         * swallowing it would eject the student to the login screen every time
         * the server hiccups.
         */
        throw error;
      }
    }

    const session = read('session', null);
    if (!session) return respondFast(null);

    const student = findStudent(session.userId);
    if (!student) {
      remove('session');
      return respondFast(null);
    }
    return respondFast(decorateStudent(student));
  },

  /** Sign out and clear the local session. */
  async logout() {
    // Drop the cached live student first, or the next page render would still
    // greet the signed-out user by the name they just signed out of.
    liveStudent = null;

    remove('session');
    utcClient.logout();
    return respondFast({ ok: true });
  },

  /**
   * Change the password on the portal.
   * @param {{oldPassword: string, newPassword: string, retypePassword: string}} payload
   */
  async changePassword(payload) {
    if (!utcClient.isLive) {
      return respond(null, {
        fail: true,
        error: 'Đổi mật khẩu cần backend thật. Hãy bật USE_LIVE_API trong scripts/api/config.js.',
        code: 'LIVE_DISABLED',
      });
    }

    try {
      const { message } = await utcClient.changePassword(payload);
      return respond({ ok: true, message });
    } catch (error) {
      return respond(null, { fail: true, error: error.message, code: error.code });
    }
  },

  /** True when sign-in is hitting the hosted UTC backend. */
  isLive: () => utcClient.isLive,

  /** Which transport the client is using: 'direct' | 'proxy'. */
  transport: () => utcClient.MODE,
};

/* -------------------------------------------------------------------------- */
/* Users & profile                                                             */
/* -------------------------------------------------------------------------- */

/** Fields a student may never change — enforced here, not just in the UI. */
export const LOCKED_PROFILE_FIELDS = [
  'studentId',
  'fullName',
  'email',
  'schoolEmail',
  'faculty',
  'major',
  'cohort',
  'className',
  'phone',
  'birthDate',
  'address',
  'scholar',
];

/** Maximum bio length, in characters. */
export const BIO_MAX_LENGTH = 500;

/**
 * True when the backend owns the social features.
 *
 * The local dataset stays in place as a fallback so the app still runs without
 * the backend; when the backend is present it is the source of truth, because
 * only it can tell two browsers apart.
 */
const BACKEND_SOCIAL = Boolean(utcClient.friends);

/** Run a backend call, falling back to the local implementation on failure. */
async function viaBackend(backendCall, localCall) {
  if (!BACKEND_SOCIAL) return localCall();
  try {
    return await backendCall();
  } catch (error) {
    // A network blip should not blank the page: fall back to the local store
    // and let the next successful refresh reconcile it.
    console.warn('[api] backend lỗi, dùng dữ liệu local:', error.message);
    return localCall();
  }
}

export const users = {
  /** Full profile for a student id. */
  async get(id) {
    return respond(decorateStudent(findStudent(id)));
  },

  /** Look up by student ID (exact match, accent/space insensitive). */
  async getByStudentId(studentId) {
    const code = normalizeSearch(studentId).replace(/\s+/g, '');

    if (BACKEND_SOCIAL && utcClient.findStudent) {
      try {
        return respond(decorateStudent(await utcClient.findStudent(code)));
      } catch (error) {
        // A student who never signed in is a 404, not a failure: report the
        // miss rather than masking it as a network problem.
        if (error?.status === 404 || error?.code === 'STUDENT_NOT_FOUND') {
          return respond(null, {
            fail: true,
            error: 'Sinh viên không tồn tại hoặc chưa có tài khoản.',
          });
        }
        throw error;
      }
    }

    const student = db.table('students').find((s) => s.studentId === code);
    if (student) return respond(decorateStudent(student));

    // A signed-in student is never in the demo dataset, so a lookup that
    // misses the demo table may still find a real person who has logged in.
    const live = db.table('students').find((s) => s.studentId === code && String(s.id).startsWith('live:'));
    return respond(decorateStudent(live ?? null));
  },

  /**
   * Make sure the signed-in student exists in the local store.
   *
   * Only needed in local mode: on the backend the record is written during
   * login, so this is a no-op there and simply refreshes the cached profile.
   */
  async ensureLiveStudent(identity) {
    if (!identity?.studentId) return respondFast(null);

    if (BACKEND_SOCIAL && utcClient.me) {
      try {
        liveStudent = decorateStudent(await utcClient.me());
        return respond(liveStudent);
      } catch {
        /* stay on the cached profile rather than failing a sign-in */
      }
    }

    const id = `live:${identity.studentId}`;
    const existing = db.find('students', id) ?? {};
    const host = db.table('students').find((s) => s.id === LIVE_HOST_ID) ?? {};

    const merged = decorateStudent({
      ...existing,
      ...identity,
      id,
      studentId: identity.studentId,
      fullName: identity.fullName || existing.fullName || identity.studentId,
      password: undefined,
      presence: 'online',
      avatarIndex: identity.avatarIndex ?? existing.avatarIndex ?? host.avatarIndex ?? 0,
    });

    db.upsert('students', merged);
    liveStudent = merged;

    return respond(merged);
  },

  /**
   * Update the profile. Only `bio` is writable; everything else is rejected
   * even if a crafted request tries to pass it.
   */
  async updateProfile(patch) {
    const userId = requireUser();
    const student = findStudent(userId);

    const attempted = Object.keys(patch).filter((key) => key !== 'bio');
    if (attempted.length) {
      return respond(null, {
        fail: true,
        error: `Trường không được phép chỉnh sửa: ${attempted.join(', ')}.`,
      });
    }

    const bio = String(patch.bio ?? '').trim();
    if (bio.length > BIO_MAX_LENGTH) {
      return respond(null, {
        fail: true,
        error: `Phần giới thiệu tối đa ${BIO_MAX_LENGTH} ký tự.`,
      });
    }

    db.upsert('students', { id: userId, bio });
    return respond(decorateStudent(findStudent(userId)));
  },

  /**
   * Directory listing — powers the "gợi ý bạn bè" rail.
   */
  async directory({ limit = 12, excludeIds = [] } = {}) {
    const rows = db
      .table('students')
      .filter((s) => !excludeIds.includes(s.id))
      .slice(0, limit)
      .map(decorateStudent);
    return respondFast(rows);
  },
};

/* -------------------------------------------------------------------------- */
/* News                                                                        */
/* -------------------------------------------------------------------------- */

export const newsApi = {
  categories: () => respondFast(newsCategories),

  /** True when the live feed is available. */
  isLive: () => utcClient.isLive && utcClient.MODE === 'proxy',

  /**
   * Announcements from the portal.
   *
   * Falls back to the bundled dataset when the backend is unreachable, and the
   * page says which one it rendered — a stale cached announcement is worse than
   * an obviously sample one.
   *
   * @param {{page?: number, pageSize?: number, query?: string,
   *          category?: string}} params
   */
  async listLive({ page = 1, pageSize = 20, query = '', category = 'all' } = {}) {
    if (!newsApi.isLive()) return respondFast(null);

    try {
      const data = await utcClient.news({ page, pageSize, q: query });

      let items = data.items;
      if (category !== 'all') {
        items = items.filter((n) => n.category === category);
      }

      return respond({ source: 'utc', live: true, ...data, items });
    } catch (error) {
      console.warn('[news] Không lấy được tin tức thật, dùng dữ liệu mẫu:', error.message);
      return respondFast(null);
    }
  },

  /** Publishers offered as filters, or an empty list. */
  async publishers() {
    if (!newsApi.isLive()) return respondFast([]);

    try {
      return respond(await utcClient.newsPublishers());
    } catch {
      return respondFast([]);
    }
  },

  /** One announcement with its body, or null when the live feed is unavailable. */
  async getLive(id) {
    if (!newsApi.isLive()) return respondFast(null);

    try {
      return respond(await utcClient.newsDetail(id));
    } catch (error) {
      console.warn('[news] Không tải được nội dung tin:', error.message);
      return respondFast(null);
    }
  },

  /**
   * List articles, newest first.
   * @param {{category?: string, query?: string, limit?: number}} params
   */
  async list({ category = 'all', query = '', limit } = {}) {
    const userId = currentUserId();
    let rows = db.table('news');

    if (category !== 'all') rows = rows.filter((n) => n.category === category);
    if (query) rows = rows.filter((n) => matches(`${n.title} ${n.excerpt}`, query));

    rows = [...rows].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt - a.publishedAt
    );
    if (limit) rows = rows.slice(0, limit);

    const enriched = rows.map((n) => ({
      ...db.detach(n),
      categoryInfo: newsCategories.find((c) => c.id === n.category),
      isRead: Boolean(userId && db.table('news').find((x) => x.id === n.id)?.readBy?.includes(userId)),
    }));

    return respond(enriched);
  },

  /** A single article; marks it read for the current user. */
  async get(id) {
    const article = db.find('news', id);
    if (!article) {
      return respond(null, { fail: true, error: 'Không tìm thấy bài viết.' });
    }

    const userId = currentUserId();
    if (userId) {
      const row = db.find('news', id);
      const readBy = Array.isArray(row.readBy) ? row.readBy : [];
      if (!readBy.includes(userId)) {
        db.upsert('news', { id, readBy: [...readBy, userId] });
      }
    }

    return respond({
      ...db.detach(article),
      categoryInfo: newsCategories.find((c) => c.id === article.category),
      relativeTime: timeAgo(article.publishedAt),
    });
  },

  /** Everything the current user has not opened yet. */
  async unreadCount() {
    const userId = currentUserId();
    if (!userId) return respondFast(0);
    const count = db
      .table('news')
      .filter((n) => !(n.readBy ?? []).includes(userId)).length;
    return respondFast(count);
  },
};

/* -------------------------------------------------------------------------- */
/* Schedule                                                                    */
/* -------------------------------------------------------------------------- */

export const schedule = {
  term: () => respondFast(termConfig),

  courses: () => respondFast(db.detachAll(courses)),

  /**
   * Live timetable from the UTC backend.
   *
   * Returns `null` rather than throwing when the backend is unreachable, so the
   * page can fall back to the bundled dataset instead of showing an error the
   * student cannot act on. A cancelled class is exactly the case where silent
   * fallback is wrong, so the page surfaces which source it rendered.
   *
   * @param {{weekOffset?: number}} params
   */
  async getLiveWeek({ weekOffset = 0 } = {}) {
    if (!utcClient.isLive || utcClient.MODE !== 'proxy') return respondFast(null);

    try {
      const data = await utcClient.schedule({ weekOffset });
      return respond({ source: 'utc', live: true, ...data });
    } catch (error) {
      console.warn('[schedule] Không lấy được dữ liệu thật, dùng dữ liệu mẫu:', error.message);
      return respondFast(null);
    }
  },

  /**
   * A single week of sessions, enriched with course data.
   * @param {{week?: number}} params
   */
  async getWeek({ week = termConfig.currentWeek } = {}) {
    const rows = db.table('scheduleSessions').filter(
      (s) => week >= s.weekFrom && week <= s.weekTo
    );

    const enriched = rows
      .map((s) => {
        const course = courses.find((c) => c.id === s.courseId);
        return {
          ...s,
          courseName: course?.name ?? 'Môn học',
          courseCode: course?.code ?? '',
          teacher: course?.teacher ?? '',
          colorIndex: course?.colorIndex ?? 1,
          durationMinutes: minutesBetween(s.start, s.end),
        };
      })
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

    return respond({ week, sessions: enriched });
  },

  /**
   * Today's sessions from the UTC backend, shaped like `getDay()`.
   *
   * The dashboard used to read the bundled demo table, so its times silently
   * disagreed with the timetable page (and with the real class times). Fetch
   * the live week and pick the matching day; fall back to demo data only when
   * the backend is unreachable.
   */
  async getLiveDay(date = new Date()) {
    const week = await this.getLiveWeek({ weekOffset: 0 });
    if (!week?.days) return this.getDay(date);

    const iso = localIsoDate(date);
    const day = week.days.find((d) => d.date === iso);

    return respond({
      date: iso,
      live: true,
      sessions: (day?.sessions ?? []).map((s) => ({
        ...s,
        start: s.startTime,
        end: s.endTime,
        courseName: s.subject,
        durationMinutes: minutesBetween(s.startTime, s.endTime),
      })),
    });
  },

  /** Sessions for a given date, flagged past / current / upcoming. */
  async getDay(date = new Date()) {
    const weekday = schoolDay(date);
    const rows = db.table('scheduleSessions').filter((s) => s.day === weekday);

    const enriched = rows
      .map((s) => {
        const course = courses.find((c) => c.id === s.courseId);
        return {
          ...s,
          courseName: course?.name ?? 'Môn học',
          courseCode: course?.code ?? '',
          teacher: course?.teacher ?? '',
          colorIndex: course?.colorIndex ?? 1,
          durationMinutes: minutesBetween(s.start, s.end),
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    return respond({ date: String(date), sessions: enriched });
  },

  /** The next session that has not finished yet. */
  async getNextSession() {
    const today = new Date();
    const weekday = schoolDay(today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    const todayRows = db
      .table('scheduleSessions')
      .filter((s) => s.day === weekday)
      .map((s) => ({ ...s, startMinutes: minutesBetween('00:00', s.start) }))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    let next = todayRows.find((s) => s.startMinutes + minutesBetween(s.start, s.end) > nowMinutes);

    if (!next) {
      // Roll forward to the next teaching day
      for (let offset = 1; offset <= 7 && !next; offset += 1) {
        const target = addDays(today, offset);
        const day = schoolDay(target);
        next = db
          .table('scheduleSessions')
          .filter((s) => s.day === day)
          .sort((a, b) => a.start.localeCompare(b.start))[0];
        if (next) next = { ...next, isNextDay: true, date: target };
      }
    }

    if (!next) return respondFast(null);

    const course = courses.find((c) => c.id === next.courseId);
    return respond({
      ...next,
      courseName: course?.name ?? 'Môn học',
      courseCode: course?.code ?? '',
      teacher: course?.teacher ?? '',
      colorIndex: course?.colorIndex ?? 1,
      startsAt: next.date
        ? next.date
        : nextDateForWeekday(today, weekday),
    });
  },

  exams: () => {
    const rows = db
      .table('exams')
      .map((e) => {
        const course = courses.find((c) => c.id === e.courseId);
        return {
          ...e,
          courseName: course?.name ?? 'Môn học',
          courseCode: course?.code ?? '',
          colorIndex: course?.colorIndex ?? 1,
          daysLeft: Math.max(
            0,
            Math.ceil((e.date - Date.now()) / 86_400_000)
          ),
        };
      })
      .sort((a, b) => a.date - b.date);
    return respond(rows);
  },
};

/** Build a Date for the next occurrence of an ISO weekday. */
function nextDateForWeekday(from, weekday) {
  const date = startOfDay(from);
  const delta = (weekday - schoolDay(date) + 7) % 7;
  return addDays(date, delta);
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                       */
/* -------------------------------------------------------------------------- */

export const postsApi = {
  /** Feed with author enrichment and the viewer's own reactions. */
  async list({ scope = 'all', limit = 30 } = {}) {
    const userId = currentUserId();

    if (BACKEND_SOCIAL && utcClient.posts) {
      try {
        const rows = await utcClient.posts({ scope, limit });
        return respond(rows.map((p) => decoratePost(p, userId)));
      } catch (error) {
        console.warn('[api] posts list lỗi:', error.message);
        return respond([]);
      }
    }

    let rows = [...db.table('posts')].sort((a, b) => b.createdAt - a.createdAt);
    if (scope === 'friends') {
      const friends = acceptedFriendIds(userId);
      rows = rows.filter((p) => friends.includes(p.authorId));
    }

    const enriched = rows.slice(0, limit).map((p) => decoratePost(p, userId));
    return respond(enriched);
  },

  async get(id) {
    const userId = currentUserId();
    const post = db.find('posts', id);
    if (!post) return respond(null, { fail: true, error: 'Không tìm thấy bài viết.' });
    return respond(decoratePost(post, userId));
  },

  /** Publish a new post. */
  async create({ content }) {
    if (BACKEND_SOCIAL && utcClient.createPost) {
      try {
        return respond(decoratePost(await utcClient.createPost(content), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const text = String(content ?? '').trim();
    if (!text) {
      return respond(null, { fail: true, error: 'Nội dung bài viết không được để trống.' });
    }
    if (text.length > 5000) {
      return respond(null, { fail: true, error: 'Bài viết tối đa 5000 ký tự.' });
    }

    const post = {
      id: db.uid('p'),
      authorId: userId,
      content: text,
      createdAt: Date.now(),
      likes: 0,
      dislikes: 0,
      likedBy: [],
      dislikedBy: [],
      comments: [],
    };

    db.upsert('posts', post);
    return respond(decoratePost(db.find('posts', post.id), userId));
  },

  /**
   * Real-time broadcast hook.
   *
   * The backend pushes posts and messages over the socket, so this no longer
   * has to simulate anything — it exists so a page that still calls it keeps
   * working unchanged.
   */
  async notify({ type, payload }) {
    return respondFast({ type, payload, at: Date.now() });
  },

  /** Toggle a like. Reacting with the same vote again removes it. */
  async toggleLike(id) {
    if (BACKEND_SOCIAL && utcClient.togglePostLike) {
      try {
        return respond(decoratePost(await utcClient.togglePostLike(id, 'like'), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const post = db.find('posts', id);
    if (!post) return respond(null, { fail: true, error: 'Bài viết không tồn tại.' });

    const likedBy = post.likedBy ?? [];
    const dislikedBy = post.dislikedBy ?? [];
    const alreadyLiked = likedBy.includes(userId);

    const nextLiked = alreadyLiked
      ? likedBy.filter((u) => u !== userId)
      : [...likedBy, userId];

    const nextDisliked = dislikedBy.filter((u) => u !== userId);

    db.upsert('posts', {
      id,
      likedBy: nextLiked,
      dislikedBy: nextDisliked,
      likes: nextLiked.length,
      dislikes: nextDisliked.length,
    });

    return respond(decoratePost(db.find('posts', id), userId));
  },

  /** Toggle a dislike. Mutually exclusive with like. */
  async toggleDislike(id) {
    if (BACKEND_SOCIAL && utcClient.togglePostLike) {
      try {
        return respond(decoratePost(await utcClient.togglePostLike(id, 'dislike'), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const post = db.find('posts', id);
    if (!post) return respond(null, { fail: true, error: 'Bài viết không tồn tại.' });

    const likedBy = post.likedBy ?? [];
    const dislikedBy = post.dislikedBy ?? [];
    const alreadyDisliked = dislikedBy.includes(userId);

    const nextDisliked = alreadyDisliked
      ? dislikedBy.filter((u) => u !== userId)
      : [...dislikedBy, userId];

    const nextLiked = likedBy.filter((u) => u !== userId);

    db.upsert('posts', {
      id,
      likedBy: nextLiked,
      dislikedBy: nextDisliked,
      likes: nextLiked.length,
      dislikes: nextDisliked.length,
    });

    return respond(decoratePost(db.find('posts', id), userId));
  },

  /** Add a comment. */
  async addComment(postId, { text }) {
    if (BACKEND_SOCIAL && utcClient.addPostComment) {
      try {
        return respond(decoratePost(await utcClient.addPostComment(postId, text), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const post = db.find('posts', postId);
    if (!post) return respond(null, { fail: true, error: 'Bài viết không tồn tại.' });

    const body = String(text ?? '').trim();
    if (!body) {
      return respond(null, { fail: true, error: 'Nội dung bình luận không được để trống.' });
    }

    const comments = post.comments ?? [];
    const comment = {
      id: db.uid('c'),
      authorId: userId,
      text: body,
      createdAt: Date.now(),
    };

    db.upsert('posts', { id: postId, comments: [...comments, comment] });
    return respond(decoratePost(db.find('posts', postId), userId));
  },

  /** Delete a post — author only. */
  async remove(postId) {
    if (BACKEND_SOCIAL && utcClient.deletePost) {
      try {
        return respond(await utcClient.deletePost(postId));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const post = db.find('posts', postId);
    if (!post) return respond(null, { fail: true, error: 'Bài viết không tồn tại.' });
    if (post.authorId !== userId) {
      return respond(null, { fail: true, error: 'Bạn chỉ có thể xoá bài của chính mình.' });
    }
    db.removeRow('posts', postId);
    return respond({ ok: true });
  },
};

/** Attach author, viewer reaction state, and comment authors to a post. */
function decoratePost(post, viewerId) {
  if (!post) return null;

  // The backend resolves the author, every comment author, and this viewer's
  // reactions already. Re-deriving them from the local tables would disagree
  // with the server the moment two people are online.
  if (BACKEND_SOCIAL) {
    return {
      ...post,
      author: decorateStudent(mergeLocal(post.author)),
      comments: (post.comments ?? []).map((comment) => ({
        ...comment,
        author: decorateStudent(mergeLocal(comment.author)),
        relativeTime: timeAgo(comment.createdAt),
      })),
      viewerLiked: Boolean(post.viewerLiked),
      viewerDisliked: Boolean(post.viewerDisliked),
      relativeTime: timeAgo(post.createdAt),
    };
  }

  return {
    ...db.detach(post),
    author: decorateStudent(db.find('students', post.authorId)),
    comments: (post.comments ?? []).map((comment) => ({
      ...comment,
      author: decorateStudent(db.find('students', comment.authorId)),
      relativeTime: timeAgo(comment.createdAt),
    })),
    viewerLiked: Boolean(viewerId && (post.likedBy ?? []).includes(viewerId)),
    viewerDisliked: Boolean(viewerId && (post.dislikedBy ?? []).includes(viewerId)),
    relativeTime: timeAgo(post.createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export const documentsApi = {
  /**
   * Filtered, sorted, paginated document list.
   * @param {{query?: string, courseId?: string, fileType?: string,
   *          semester?: string, sort?: 'newest'|'downloads'|'likes',
   *          page?: number, pageSize?: number}} params
   */
  async list({
    query = '',
    courseId = 'all',
    fileType = 'all',
    semester = 'all',
    sort = 'newest',
    page = 1,
    pageSize = 9,
  } = {}) {
    if (BACKEND_SOCIAL && utcClient.documents) {
      try {
        const data = await utcClient.documents({ query, courseId, fileType, semester, sort, page, pageSize });

        // The page renders `courseName`, `colorIndex`, and `relativeTime` on
        // every card, so each row is decorated here — the backend has no
        // course catalogue to resolve those from.
        return respondFast({
          ...data,
          items: (data.items ?? []).map((d) => decorateDocument(d, currentUserId())),
        });
      } catch (error) {
        console.warn('[api] documents list lỗi:', error.message);
        return respondFast({
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
          facets: { fileTypes: {}, semesters: [] },
        });
      }
    }

    let rows = db.table('documents');

    if (courseId !== 'all') rows = rows.filter((d) => d.courseId === courseId);
    if (semester !== 'all') rows = rows.filter((d) => d.semester === semester);
    if (fileType !== 'all') {
      rows = rows.filter((d) => fileTypeOf(d.fileName) === fileType);
    }
    if (query) {
      rows = rows.filter((d) =>
        matches(`${d.title} ${d.description ?? ''} ${d.fileName}`, query)
      );
    }

    const sorters = {
      newest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      downloads: (a, b) => b.downloads - a.downloads,
      likes: (a, b) => b.likes - a.likes,
      title: (a, b) => a.title.localeCompare(b.title, 'vi'),
    };
    rows = [...rows].sort(sorters[sort] ?? sorters.newest);

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);

    return respond({
      items: slice.map((d) => decorateDocument(d, currentUserId())),
      total,
      page,
      totalPages,
      facets: {
        courses: courseFacets(),
        fileTypes: fileTypeFacets(),
        semesters: semesterFacets(),
      },
    });
  },

  /** Publish a new shared document. */
  async create(payload) {
    if (BACKEND_SOCIAL && utcClient.uploadDocument) {
      try {
        const doc = await utcClient.uploadDocument(payload);
        return respond(decorateDocument(mergeLocal(doc), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const title = String(payload.title ?? '').trim();
    const courseId = String(payload.courseId ?? '').trim();

    if (!title) return respond(null, { fail: true, error: 'Vui lòng nhập tiêu đề tài liệu.' });
    if (!courseId) return respond(null, { fail: true, error: 'Vui lòng chọn môn học.' });

    const description = String(payload.description ?? '').trim();
    if (description.length > 500) {
      return respond(null, {
        fail: true,
        error: 'Mô tả tối đa 500 ký tự.',
      });
    }

    const file = payload.file ?? null;

    const doc = {
      id: db.uid('f'),
      courseId,
      title,
      description,
      fileName: file?.name ?? `${slugify(title)}.pdf`,
      fileSize: file?.size ?? 1_200_000,
      mimeType: file?.type ?? 'application/pdf',
      authorId: userId,
      createdAt: Date.now(),
      downloads: 0,
      likes: 0,
      likedBy: [],
      semester: payload.semester ?? 'HK2-2025',
      tags: (payload.tags ?? []).slice(0, 6),
    };

    db.upsert('documents', doc);
    return respond(decorateDocument(db.find('documents', doc.id), userId));
  },

  /** Increment the download counter. */
  async download(id) {
    const doc = db.find('documents', id);

    if (BACKEND_SOCIAL && utcClient.downloadDocument) {
      try {
        // The backend streams the real bytes and counts the hit; there is no
        // record to update locally, so report the file we were given.
        await utcClient.downloadDocument(id, doc?.fileName);
        return respondFast({ ok: true });
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    if (!doc) return respond(null, { fail: true, error: 'Tài liệu không tồn tại.' });
    db.upsert('documents', { id, downloads: doc.downloads + 1 });
    return respond(decorateDocument(db.find('documents', id), currentUserId()));
  },

  /** Toggle a "useful" reaction. */
  async toggleLike(id) {
    if (BACKEND_SOCIAL && utcClient.toggleDocumentLike) {
      try {
        const doc = await utcClient.toggleDocumentLike(id);
        return respond(decorateDocument(mergeLocal(doc), currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const doc = db.find('documents', id);
    if (!doc) return respond(null, { fail: true, error: 'Tài liệu không tồn tại.' });

    const likedBy = doc.likedBy ?? [];
    const nextLiked = likedBy.includes(userId)
      ? likedBy.filter((u) => u !== userId)
      : [...likedBy, userId];

    db.upsert('documents', { id, likedBy: nextLiked, likes: nextLiked.length });
    return respond(decorateDocument(db.find('documents', id), userId));
  },

  /** Delete a shared document — author only. */
  async remove(id) {
    if (BACKEND_SOCIAL && utcClient.deleteDocument) {
      try {
        return respond(await utcClient.deleteDocument(id));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const doc = db.find('documents', id);
    if (!doc) return respond(null, { fail: true, error: 'Tài liệu không tồn tại.' });
    if (doc.authorId !== userId) {
      return respond(null, { fail: true, error: 'Bạn chỉ có thể xoá tài liệu của chính mình.' });
    }
    db.removeRow('documents', id);
    return respond({ ok: true });
  },
};

function decorateDocument(doc, viewerId) {
  if (!doc) return null;

  // A backend document carries real size, MIME type, and download count, so
  // none of the fabricated fields the local seed needs are filled in here.
  if (BACKEND_SOCIAL) {
    const course = doc.courseId ? courses.find((c) => c.id === doc.courseId) : null;
    return {
      ...doc,
      /**
       * The local dataset names this `fileSize`; the backend names it `size`.
       * Both are published so the card renders without knowing which store the
       * document came from.
       */
      fileSize: doc.size ?? 0,
      author: decorateStudent(mergeLocal(doc.author)),
      courseName: course?.name ?? 'Môn khác',
      courseCode: course?.code ?? '—',
      colorIndex: course?.colorIndex ?? 1,
      fileType: doc.fileType ?? fileTypeOf(doc.fileName),
      relativeTime: timeAgo(doc.createdAt),
      viewerLiked: Boolean(doc.viewerLiked),
    };
  }

  const course = courses.find((c) => c.id === doc.courseId);
  return {
    ...db.detach(doc),
    author: decorateStudent(db.find('students', doc.authorId)),
    courseName: course?.name ?? 'Môn khác',
    courseCode: course?.code ?? '—',
    colorIndex: course?.colorIndex ?? 1,
    fileType: fileTypeOf(doc.fileName),
    relativeTime: timeAgo(doc.createdAt),
    viewerLiked: Boolean(viewerId && (doc.likedBy ?? []).includes(viewerId)),
  };
}

/** Map a filename to a coarse file-type bucket. */
export function fileTypeOf(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'xls';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'ppt';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'img';
  return 'other';
}

/** Available semesters found in the dataset. */
function semesterFacets() {
  return [...new Set(db.table('documents').map((d) => d.semester))].sort().reverse();
}

function fileTypeFacets() {
  const counts = {};
  db.table('documents').forEach((d) => {
    const type = fileTypeOf(d.fileName);
    counts[type] = (counts[type] ?? 0) + 1;
  });
  return counts;
}

function courseFacets() {
  const counts = {};
  db.table('documents').forEach((d) => {
    counts[d.courseId] = (counts[d.courseId] ?? 0) + 1;
  });
  return courses
    .filter((c) => counts[c.id])
    .map((c) => ({ id: c.id, code: c.code, name: c.name, count: counts[c.id] }));
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Friends                                                                     */
/* -------------------------------------------------------------------------- */

/** Ids of every accepted friend of a student. */
function acceptedFriendIds(userId) {
  if (!userId) return [];
  return db
    .table('friendships')
    .filter(
      (f) => f.status === 'accepted' && (f.from === userId || f.to === userId)
    )
    .map((f) => (f.from === userId ? f.to : f.from));
}

export const friends = {
  /**
   * Search by student ID. Exact match - this is the primary lookup path.
   *
   * A student who has never signed in does not exist on the backend, and the
   * message says so plainly rather than returning an empty profile.
   */
  async search({ studentId }) {
    const code = normalizeSearch(studentId).replace(/\s+/g, '');
    if (!code) {
      return respond(null, { fail: true, error: 'Vui lòng nhập mã sinh viên.' });
    }

    if (BACKEND_SOCIAL && utcClient.searchFriend) {
      try {
        return respond(decorateStudent(await utcClient.searchFriend(code)));
      } catch (error) {
        return respond(null, {
          fail: true,
          error:
            error?.status === 404 || error?.code === 'STUDENT_NOT_FOUND'
              ? 'Sinh viên không tồn tại hoặc chưa có tài khoản.'
              : error.message,
        });
      }
    }

    // A signed-in student is recorded locally as `live:<code>`, so the same
    // lookup path finds them without a separate branch.
    const student = db.table('students').find((s) => s.studentId === code);
    if (!student) {
      return respond(null, {
        fail: true,
        error: 'Sinh viên không tồn tại hoặc chưa có tài khoản.',
      });
    }

    return respond(decorateRelationship(student));
  },

  /** Accepted friends + pending requests, both directions. */
  async list() {
    if (BACKEND_SOCIAL && utcClient.friends) {
      const data = await utcClient.friends();
      return respond({
        accepted: data.accepted.map(decorateStudent),
        incoming: data.incoming.map(decorateStudent),
        outgoing: data.outgoing.map(decorateStudent),
        suggestions: data.suggestions.map(decorateStudent),
      });
    }

    const userId = requireUser();
    const rows = db.table('friendships');
    const mine = rows.filter((f) => f.from === userId || f.to === userId);

    const accepted = mine
      .filter((f) => f.status === 'accepted')
      .map((f) => decorateStudent(findStudent(f.from === userId ? f.to : f.from)));

    const incoming = mine
      .filter((f) => f.status === 'pending' && f.to === userId)
      .map((f) => decorateStudent(db.find('students', f.from)));

    const outgoing = mine
      .filter((f) => f.status === 'pending' && f.from === userId)
      .map((f) => decorateStudent(db.find('students', f.to)));

    const suggestions = db
      .table('students')
      .filter(
        (s) =>
          s.id !== userId &&
          !mine.some((f) => f.from === s.id || f.to === s.id)
      )
      .slice(0, 6)
      .map(decorateStudent);

    return respond({ accepted, incoming, outgoing, suggestions });
  },

  /** Send (or re-send) a friend request. */
  async request({ studentId }) {
    if (BACKEND_SOCIAL && utcClient.sendFriendRequest) {
      try {
        const student = await utcClient.sendFriendRequest(studentId);
        return respond(decorateRelationship(mergeLocal(student)));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const target = db.table('students').find((s) => s.studentId === studentId);

    if (!target) {
      return respond(null, { fail: true, error: 'Không tìm thấy sinh viên này.' });
    }
    if (target.id === userId) {
      return respond(null, { fail: true, error: 'Bạn không thể tự kết bạn với chính mình.' });
    }

    const existing = db
      .table('friendships')
      .find((f) => (f.from === userId && f.to === target.id) || (f.from === target.id && f.to === userId));

    if (existing?.status === 'accepted') {
      return respond(null, { fail: true, error: 'Hai người đã là bạn bè.' });
    }
    if (existing?.status === 'pending') {
      return respond(null, { fail: true, error: 'Đã có lời mời kết bạn đang chờ xử lý.' });
    }

    if (existing) {
      // They asked first — treat this as a mutual accept.
      db.upsert('friendships', { id: existing.id, status: 'accepted', acceptedAt: Date.now() });
      return respond(decorateRelationship(db.find('students', target.id)));
    }

    db.upsert('friendships', {
      id: db.uid('fr'),
      from: userId,
      to: target.id,
      status: 'pending',
      createdAt: Date.now(),
    });

    return respond(decorateRelationship(db.find('students', target.id)));
  },

  /** Accept an incoming request. */
  async accept({ friendshipId }) {
    if (BACKEND_SOCIAL && utcClient.acceptFriendRequest) {
      try {
        const friend = await utcClient.acceptFriendRequest(friendshipId);
        return respond(decorateStudent(mergeLocal(friend)));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const friendship = db.find('friendships', friendshipId);
    if (!friendship) return respond(null, { fail: true, error: 'Không tìm thấy lời mời.' });
    if (friendship.to !== userId) {
      return respond(null, { fail: true, error: 'Bạn không thể xử lý lời mời này.' });
    }

    db.upsert('friendships', { id: friendshipId, status: 'accepted', acceptedAt: Date.now() });
    return respond(decorateStudent(db.find('students', friendship.from)));
  },

  /** Decline or cancel a request. */
  async decline({ friendshipId }) {
    if (BACKEND_SOCIAL && utcClient.declineFriendRequest) {
      try {
        return respond(await utcClient.declineFriendRequest(friendshipId));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    requireUser();
    db.removeRow('friendships', friendshipId);
    return respond({ ok: true });
  },

  /** Unfriend. */
  async remove({ studentId }) {
    if (BACKEND_SOCIAL && utcClient.removeFriend) {
      try {
        return respond(await utcClient.removeFriend(studentId));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const friendship = db
      .table('friendships')
      .find((f) => (f.from === userId && f.to === studentId) || (f.from === studentId && f.to === userId));
    if (friendship) db.removeRow('friendships', friendship.id);
    return respond({ ok: true });
  },
};

/**
 * Cache a backend profile locally.
 *
 * The local store keeps the demo fields the UI reads (avatar palette, seeded
 * extras). A real record is merged over that base rather than replacing it, so
 * a student without a seeded entry still renders with a consistent avatar.
 */
function mergeLocal(student) {
  if (!student?.id) return student;

  const cached = db.find('students', student.id);
  if (!cached) {
    db.upsert('students', { ...student, password: undefined });
    return db.find('students', student.id);
  }

  const merged = { ...cached, ...student, password: undefined };
  db.upsert('students', merged);
  return merged;
}

/** Add relationship state to a decorated student. */
function decorateRelationship(student) {
  if (!student) return null;

  // The backend already computed relation, friendshipId, and mutualCount, so
  // the local friendship table has nothing to add — and consulting it would
  // report a stale relationship next to a live one.
  if (BACKEND_SOCIAL) {
    return {
      ...decorateStudent(student),
      relation: student.relation ?? 'none',
      friendshipId: student.friendshipId ?? null,
      mutualCount: student.mutualCount ?? 0,
      isSelf: Boolean(student.isSelf),
    };
  }

  const userId = currentUserId();
  const base = decorateStudent(student);
  if (!base) return null;

  const friendship = db
    .table('friendships')
    .find(
      (f) =>
        (f.from === userId && f.to === student.id) ||
        (f.to === userId && f.from === student.id)
    );

  const mutualCount = db
    .table('friendships')
    .filter(
      (f) =>
        f.status === 'accepted' &&
        acceptedFriendIds(student.id).includes(f.from === userId ? f.to : f.from)
    ).length;

  return {
    ...base,
    relation: friendship?.status ?? 'none',
    friendshipId: friendship?.id ?? null,
    mutualCount,
    isSelf: student.id === userId,
  };
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

export const chatApi = {
  /**
   * Resolve an attachment's bytes once, so the renderer can show the image.
   *
   * Exposed rather than done inside `decorateMessage` because a fetch belongs
   * after the row is on screen, not before it.
   */
  ensureAttachment,
  /** Conversation list for the current user. */
  async list() {
    if (BACKEND_SOCIAL && utcClient.conversations) {
      try {
        return respond((await utcClient.conversations()).map((c) => decorateConversation(c, currentUserId())));
      } catch (error) {
        console.warn('[api] chat list lỗi:', error.message);
        return respond([]);
      }
    }

    const userId = requireUser();
    const rows = db
      .table('conversations')
      .filter((c) => c.memberIds.includes(userId))
      .map((c) => decorateConversation(c, userId))
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

    return respond(rows);
  },

  /** Messages of one conversation, oldest first. */
  async messages(conversationId) {
    if (BACKEND_SOCIAL && utcClient.conversationMessages) {
      try {
        const messages = await utcClient.conversationMessages(conversationId);
        return respond(messages.map((m) => decorateMessage(m, { id: conversationId }, currentUserId())));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const conversation = db.find('conversations', conversationId);

    if (!conversation) {
      return respond(null, { fail: true, error: 'Không tìm thấy cuộc trò chuyện.' });
    }
    if (!conversation.memberIds.includes(userId)) {
      return respond(null, { fail: true, error: 'Bạn không có quyền xem cuộc trò chuyện này.' });
    }

    return respond(
      conversation.messages.map((m) => decorateMessage(m, conversation, userId))
    );
  },

  /** Send a text message. */
  async send(conversationId, { text, attachments = [] }) {
    if (BACKEND_SOCIAL && utcClient.sendMessage) {
      try {
        const message = await utcClient.sendMessage(conversationId, { text, attachments });
        return respond(decorateMessage(message, { id: conversationId }, currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const conversation = db.find('conversations', conversationId);

    if (!conversation) {
      return respond(null, { fail: true, error: 'Không tìm thấy cuộc trò chuyện.' });
    }
    if (!conversation.memberIds.includes(userId)) {
      return respond(null, { fail: true, error: 'Bạn không có quyền gửi tin nhắn.' });
    }

    const body = String(text ?? '').trim();
    if (!body && attachments.length === 0) {
      return respond(null, { fail: true, error: 'Nội dung tin nhắn không được để trống.' });
    }
    if (body.length > 4000) {
      return respond(null, { fail: true, error: 'Tin nhắn tối đa 4000 ký tự.' });
    }

    const message = {
      id: db.uid('m'),
      senderId: userId,
      text: body,
      createdAt: Date.now(),
      status: 'sent',
      attachments,
    };

    const messages = [...conversation.messages, message];
    db.upsert('conversations', { id: conversationId, messages });

    return respond(decorateMessage(message, db.find('conversations', conversationId), userId));
  },

  /** Create a group conversation. */
  async createGroup({ title, memberIds = [] }) {
    if (BACKEND_SOCIAL && utcClient.createGroupChat) {
      try {
        const conversation = await utcClient.createGroupChat({ title, memberIds });
        return respond(decorateConversation(conversation, currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const name = String(title ?? '').trim();

    if (!name) {
      return respond(null, { fail: true, error: 'Vui lòng nhập tên nhóm.' });
    }
    if (name.length > 60) {
      return respond(null, { fail: true, error: 'Tên nhóm tối đa 60 ký tự.' });
    }
    if (!memberIds.length) {
      return respond(null, { fail: true, error: 'Hãy chọn ít nhất một thành viên.' });
    }

    const validIds = memberIds.filter((id) => db.find('students', id));
    const members = [...new Set([userId, ...validIds])];

    const conversation = {
      id: db.uid('cv'),
      type: 'group',
      title: name,
      memberIds: members,
      createdAt: Date.now(),
      createdBy: userId,
      messages: [
        {
          id: db.uid('m'),
          senderId: userId,
          type: 'system',
          text: 'Nhóm đã được tạo.',
          createdAt: Date.now(),
          status: 'read',
          attachments: [],
        },
      ],
    };

    db.upsert('conversations', conversation);
    return respond(decorateConversation(db.find('conversations', conversation.id), userId));
  },

  /** Open (or 1:1) a conversation with a set of members. */
  async openDirect(studentId) {
    if (BACKEND_SOCIAL && utcClient.openDirectChat) {
      try {
        const conversation = await utcClient.openDirectChat(studentId);
        return respond(decorateConversation(conversation, currentUserId()));
      } catch (error) {
        return respond(null, { fail: true, error: error.message });
      }
    }

    const userId = requireUser();
    const target = db.find('students', studentId);
    if (!target) return respond(null, { fail: true, error: 'Không tìm thấy sinh viên.' });

    const existing = db
      .table('conversations')
      .find(
        (c) =>
          c.type === 'direct' &&
          c.memberIds.length === 2 &&
          c.memberIds.includes(userId) &&
          c.memberIds.includes(target.id)
      );

    if (existing) return respond(decorateConversation(existing, userId));

    const conversation = {
      id: db.uid('cv'),
      type: 'direct',
      title: target.fullName,
      memberIds: [userId, target.id],
      createdAt: Date.now(),
      messages: [],
    };
    db.upsert('conversations', conversation);
    return respond(decorateConversation(db.find('conversations', conversation.id), userId));
  },

  /**
 * Upload a file to attach to a message.
 *
 * Returns the registry-shaped attachment, with a blob URL already resolved so
 * an <img> can render it straight away — a plain `src` would need the session
 * header and cannot send one.
 */
  async uploadAttachment(conversationId, file) {
    if (!BACKEND_SOCIAL || !utcClient.uploadAttachment) {
      throw new ApiError('Chưa hỗ trợ gửi tệp.', 501, 'UNSUPPORTED');
    }

    const saved = await utcClient.uploadAttachment(conversationId, file);
    const objectUrl = await utcClient.attachmentUrl?.(saved);

    return {
      id: saved.id,
      kind: saved.kind === 'image' ? 'image' : 'file',
      payload: {
        url: saved.url,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        size: saved.size,
        objectUrl,
      },
    };
  },

  /** Mark every message in a conversation as read. */
  async markRead(conversationId) {
    if (BACKEND_SOCIAL && utcClient.markConversationRead) {
      try {
        return respondFast(await utcClient.markConversationRead(conversationId));
      } catch (error) {
        return respondFast({ ok: true });
      }
    }

    const userId = requireUser();
    const conversation = db.find('conversations', conversationId);
    if (!conversation) return respondFast({ ok: true });

    const messages = conversation.messages.map((m) =>
      m.senderId !== userId && m.status !== 'read' ? { ...m, status: 'read' } : m
    );
    db.upsert('conversations', { id: conversationId, messages });
    return respondFast({ ok: true });
  },
};

function decorateConversation(conversation, userId) {
  if (!conversation) return null;

  // The backend sends everything the page renders, already resolved: peers,
  // unread count, and last message. Re-deriving any of it locally would mix
  // two sources of truth for the same conversation.
  if (BACKEND_SOCIAL) {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      memberIds: conversation.memberIds ?? [],
      createdBy: conversation.createdBy ?? null,
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
      messageCount: conversation.messageCount ?? 0,
      lastMessage: conversation.lastMessage
        ? decorateMessage(conversation.lastMessage, { id: conversation.id }, userId)
        : null,
      unread: conversation.unread ?? 0,
      members: (conversation.members ?? []).map(decorateStudent),
      peer: conversation.peer ? decorateStudent(conversation.peer) : null,
    };
  }

  const messages = conversation.messages ?? [];
  const last = messages[messages.length - 1];

  const members = conversation.memberIds
    .filter((id) => id !== userId)
    .map((id) => decorateStudent(db.find('students', id)));

  const unread = messages.filter(
    (m) => m.senderId !== userId && m.status !== 'read'
  ).length;

  return {
    ...db.detach(conversation),
    messages: undefined,
    messageCount: messages.length,
    lastMessage: last ? decorateMessage(last, conversation, userId) : null,
    lastMessageAt: last?.createdAt ?? conversation.createdAt,
    unread,
    members,
    peer: conversation.type === 'direct' ? members[0] : null,
  };
}

/**
 * attachment id -> the object URL already fetched for it.
 *
 * Resolving an image means a fetch plus a blob, and a thread repaints on every
 * incoming message — without this the same picture would be downloaded again
 * and again.
 */
const attachmentUrls = new Map();

/** Turn a server attachment descriptor into the registry's shape. */
function toRegistryAttachment(saved) {
  return {
    id: saved.id,
    kind: saved.kind === 'image' ? 'image' : 'file',
    payload: {
      url: saved.url,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      size: saved.size,
      objectUrl: attachmentUrls.get(saved.id) ?? null,
      onDownload: (attachment) => downloadChatAttachment(attachment),
    },
  };
}

/**
 * Fill in an image's blob URL, once.
 *
 * Called by the renderer after it has drawn a placeholder; a failure leaves the
 * row showing the file name and size, which is still useful.
 */
async function ensureAttachment(attachment) {
  if (!attachment?.id || attachment.payload?.objectUrl) return attachment;
  if (!utcClient.attachmentUrl) return attachment;

  // The transport keys the blob cache on the id, which lives on the
  // attachment itself rather than inside its payload.
  const url = await utcClient.attachmentUrl({ id: attachment.id, url: attachment.payload?.url });
  if (!url) return attachment;

  attachmentUrls.set(attachment.id, url);
  attachment.payload.objectUrl = url;
  return attachment;
}

/** Save a chat attachment to disk under its own name. */
async function downloadChatAttachment(attachment) {
  if (!utcClient.downloadAttachment) return { ok: false };
  return utcClient.downloadAttachment({
    id: attachment.id,
    url: attachment.payload?.url,
    fileName: attachment.payload?.fileName,
  });
}

function decorateMessage(message, conversation, viewerId) {
  // The backend sends the sender's profile and the server-side `isOwn`, so a
  // message rendered from a realtime event looks exactly like a fetched one.
  if (BACKEND_SOCIAL) {
    const sender = message.sender ?? null;
    return {
      ...message,
      sender: decorateStudent(mergeLocal(sender)),

      /**
       * Attachments are stored on the server as plain descriptors.
       *
       * They are expanded lazily: fetching a blob per image on every render
       * would re-download the same picture every time the thread repaints.
       * `ensureAttachment` fills in what the renderer needs, once.
       */
      attachments: (message.attachments ?? []).map((a) => toRegistryAttachment(a)),

      isOwn: Boolean(message.isOwn),
      senderColor: AVATAR_PALETTES[(sender?.avatarIndex ?? 0) % AVATAR_PALETTES.length][0],
      conversationId: message.conversationId ?? conversation?.id,
      relativeTime: timeAgo(message.createdAt),
    };
  }

  const sender = db.find('students', message.senderId);
  return {
    ...db.detach(message),
    sender: decorateStudent(sender),
    isOwn: message.senderId === viewerId,
    senderColor: AVATAR_PALETTES[(sender?.avatarIndex ?? 0) % AVATAR_PALETTES.length][0],
    conversationId: conversation.id,
    relativeTime: timeAgo(message.createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The notice centre.
 *
 * On the backend these are the server's records: generated when something
 * actually happened, and scoped to one student. The local table is only a
 * fallback for running without a backend, and it is shared across everyone
 * signed in on this browser — which is exactly why the backend branch is
 * preferred whenever it exists.
 */
export const notificationsApi = {
  async list() {
    if (BACKEND_SOCIAL && utcClient.notifications) {
      try {
        const rows = await utcClient.notifications();
        return respondFast(rows.map((n) => ({ ...n, relativeTime: timeAgo(n.createdAt) })));
      } catch (error) {
        console.warn('[api] không tải được thông báo:', error.message);
        return respondFast([]);
      }
    }

    const rows = [...db.table('notifications')].sort((a, b) => b.createdAt - a.createdAt);
    return respond(rows.map((n) => ({ ...db.detach(n), relativeTime: timeAgo(n.createdAt) })));
  },

  async unreadCount() {
    if (BACKEND_SOCIAL && utcClient.unreadNotificationCount) {
      try {
        return respondFast(await utcClient.unreadNotificationCount());
      } catch (error) {
        console.warn('[api] không đếm được thông báo chưa đọc:', error.message);
        return respondFast(0);
      }
    }

    return respondFast(db.table('notifications').filter((n) => !n.read).length);
  },

  async markRead(id) {
    if (BACKEND_SOCIAL && utcClient.markNotificationRead) {
      try {
        return respondFast(await utcClient.markNotificationRead(id));
      } catch (error) {
        return respondFast({ ok: false, error: error.message });
      }
    }

    db.upsert('notifications', { id, read: true });
    return respondFast({ ok: true });
  },

  async markAllRead() {
    if (BACKEND_SOCIAL && utcClient.markAllNotificationsRead) {
      try {
        return respondFast(await utcClient.markAllNotificationsRead());
      } catch (error) {
        return respondFast({ ok: false, error: error.message });
      }
    }

    db.table('notifications').forEach((n) => {
      n.read = true;
    });
    db.persist();
    return respondFast({ ok: true });
  },

  async remove(id) {
    if (BACKEND_SOCIAL && utcClient.deleteNotification) {
      try {
        return respondFast(await utcClient.deleteNotification(id));
      } catch (error) {
        return respondFast({ ok: false, error: error.message });
      }
    }

    db.removeRow('notifications', id);
    return respondFast({ ok: true });
  },
};

/* -------------------------------------------------------------------------- */
/* Dashboard aggregate                                                         */
/* -------------------------------------------------------------------------- */

export const dashboard = {
  /** Everything the home screen needs, in one round trip. */
  async summary() {
    const userId = requireUser();
    const student = findStudent(userId);

    const unreadNews = db
      .table('news')
      .filter((n) => !(n.readBy ?? []).includes(userId)).length;

    const nextExam = db
      .table('exams')
      .filter((e) => e.date > Date.now())
      .sort((a, b) => a.date - b.date)[0];
    const examCourse = nextExam
      ? courses.find((c) => c.id === nextExam.courseId)
      : null;

    /**
     * Counts come from the backend when it is there.
     *
     * The local tables are the demo's; reading them here would show a student
     * with nine unread messages on the dashboard while the sidebar — which
     * counts the same thing — says one. They can only agree if both are asking
     * the same server.
     */
    const [liveFriends, livePosts, liveDocs, liveMessages, liveNotifications] = BACKEND_SOCIAL
      ? await Promise.all([
          utcClient.friends().then((d) => d.accepted.length).catch(() => null),
          utcClient.posts({ limit: 100 }).then((rows) => rows.filter((p) => p.authorId === userId).length).catch(() => null),
          utcClient.documents({ pageSize: 50 }).then((d) => d.items.filter((x) => x.authorId === userId).length).catch(() => null),
          chatApi.list().then((rows) => rows.reduce((sum, c) => sum + (c.unread ?? 0), 0)).catch(() => null),
          utcClient.unreadNotificationCount().catch(() => null),
        ])
      : [null, null, null, null, null];

    const friendCount = liveFriends ?? acceptedFriendIds(userId).length;
    const myPosts = livePosts ?? db.table('posts').filter((p) => p.authorId === userId).length;
    const sharedDocs = liveDocs ?? db.table('documents').filter((d) => d.authorId === userId).length;

    const totalUnreadMessages =
      liveMessages ??
      db
        .table('conversations')
        .filter((c) => c.memberIds.includes(userId))
        .reduce(
          (sum, c) =>
            sum +
            c.messages.filter((m) => m.senderId !== userId && m.status !== 'read').length,
          0
        );

    const notificationsUnread =
      liveNotifications ?? db.table('notifications').filter((n) => !n.read).length;

    const attendanceAverage = Math.round(
      courses.reduce((sum, c) => sum + c.attendance, 0) / courses.length
    );

    const recentActivity = buildActivity(userId);

    return respond({
      user: decorateStudent(student),
      stats: {
        unreadNews,
        notificationsUnread,
        totalUnreadMessages,
        friendCount,
        myPosts,
        sharedDocs,
        courses: courses.length,
        attendanceAverage,
      },
      nextExam: nextExam
        ? {
            ...db.detach(nextExam),
            courseName: examCourse?.name,
            courseCode: examCourse?.code,
            colorIndex: examCourse?.colorIndex,
            daysLeft: Math.max(0, Math.ceil((nextExam.date - Date.now()) / 86_400_000)),
          }
        : null,
      courses,
      recentActivity,
    });
  },
};

/** Merge the newest items across every feature into one feed. */
function buildActivity(viewerId) {
  const items = [];

  db.table('posts')
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
    .forEach((post) => {
      const author = db.find('students', post.authorId);
      items.push({
        id: `act-post-${post.id}`,
        kind: 'post',
        route: '/posts',
        createdAt: post.createdAt,
        author,
        text: post.content.slice(0, 120),
      });
    });

  db.table('documents')
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 2)
    .forEach((doc) => {
      const course = courses.find((c) => c.id === doc.courseId);
      items.push({
        id: `act-doc-${doc.id}`,
        kind: 'document',
        route: '/documents',
        createdAt: doc.createdAt,
        author: decorateStudent(db.find('students', doc.authorId)),
        text: `đã chia sẻ tài liệu "${doc.title}" môn ${course?.name ?? ''}`,
      });
    });

  db.table('friendships')
    .filter((f) => f.from !== viewerId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 2)
    .forEach((friendship) => {
      const person = db.find(
        'students',
        friendship.from === viewerId ? friendship.to : friendship.from
      );
      items.push({
        id: `act-fr-${friendship.id}`,
        kind: 'friend',
        route: '/friends',
        createdAt: friendship.createdAt,
        author: decorateStudent(person),
        text:
          friendship.status === 'accepted'
            ? 'đã trở thành bạn bè của bạn'
            : 'đã gửi lời mời kết bạn',
      });
    });

  return items
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6)
    .map((item) => ({ ...item, relativeTime: timeAgo(item.createdAt) }));
}

/* -------------------------------------------------------------------------- */
/* Demo tooling                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Academic results.
 *
 * The final mark is recomputed here from the weighted components rather than
 * read off the record, so the transcript, the per-course breakdown and the
 * summary KPI can never disagree with one another.
 */
export const gradesApi = {
  /** Map a 0-10 mark onto its letter grade and standing. */
  toLetter(score) {
    if (score === null || score === undefined) return null;
    return gradeScale.find((band) => score >= band.min) ?? gradeScale.at(-1);
  },

  /** Weighted mean of the components that have actually been marked. */
  computeFinal(record) {
    const marked = record.components.filter((c) => c.score !== null && c.score !== undefined);
    if (!marked.length) return null;

    // Only renormalise over the weight that has been marked, so a course whose
    // final exam is still pending reports a mark out of what is known rather
    // than being dragged down by an unweighted zero.
    const totalWeight = marked.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight <= 0) return null;

    const earned = marked.reduce((sum, c) => sum + c.score * c.weight, 0);
    return earned / totalWeight;
  },

  /** Transcript for the current term, joined with the course catalogue. */
  async transcript() {
    requireUser();

    const rows = grades.map((record) => {
      const course = courses.find((c) => c.id === record.courseId);
      const final = this.computeFinal(record);
      const marked = record.components.filter((c) => c.score !== null);

      return {
        id: record.id,
        status: record.status,
        updatedAt: record.updatedAt,
        course: course
          ? {
              id: course.id,
              code: course.code,
              name: course.name,
              teacher: course.teacher,
              credits: course.credits,
              colorIndex: course.colorIndex,
            }
          : null,
        components: record.components,
        final,
        letter: this.toLetter(final),
        // How much of the course's weighting has actually been marked.
        completion: record.components.reduce((s, c) => s + c.weight, 0),
        markedWeight: marked.reduce((s, c) => s + c.weight, 0),
      };
    });

    const scored = rows.filter((r) => r.final !== null);

    // Credit-weighted GPA over graded courses only.
    const gpa = scored.length
      ? scored.reduce((sum, r) => sum + r.letter.gradePoint * r.course.credits, 0) /
        scored.reduce((sum, r) => sum + r.course.credits, 0)
      : null;

    const average = scored.length
      ? scored.reduce((sum, r) => sum + r.final, 0) / scored.length
      : null;

    return respond({
      term: termConfig.name,
      scale: gradeScale,
      history: gradeHistory,
      rows,
      summary: {
        average: average === null ? null : Number(average.toFixed(2)),
        gpa: gpa === null ? null : Number(gpa.toFixed(2)),
        credits: scored.reduce((sum, r) => sum + r.course.credits, 0),
        totalCredits: rows.reduce((sum, r) => sum + (r.course?.credits ?? 0), 0),
        passed: scored.filter((r) => r.final >= 5).length,
        total: rows.length,
        outstanding: rows.filter((r) => r.status !== 'final').length,
        strongest: scored.length
          ? scored.reduce((best, r) => (r.final > best.final ? r : best))
          : null,
        weakest: scored.length
          ? scored.reduce((worst, r) => (r.final < worst.final ? r : worst))
          : null,
      },
    });
  },
};

export const demo = {
  /** Wipe local state and restore the seed dataset. */
  async reset() {
    db.reset();
    return respond({ ok: true });
  },

  /** Session storage key, exposed for debugging. */
  sessionKey: () => storageKey('session'),
};