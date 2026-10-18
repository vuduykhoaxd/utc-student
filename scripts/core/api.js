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

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

function currentUserId() {
  const session = read('session', null);
  return session?.userId ?? null;
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
    initials: student.fullName
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    avatarFrom: palette[0],
    avatarTo: palette[1],
  };
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const auth = {
  /**
   * Sign in with a student ID and password.
   * Registration is intentionally absent — accounts are issued by the school.
   */
  async login({ studentId, password }) {
    const code = String(studentId ?? '').trim().replace(/\s+/g, '');
    const pass = String(password ?? '');

    if (!code || !pass) {
      return respond(null, {
        fail: true,
        error: 'Vui lòng nhập đầy đủ mã sinh viên và mật khẩu.',
      });
    }

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
    const session = read('session', null);
    if (!session) return respondFast(null);
    const student = db.find('students', session.userId);
    if (!student) {
      remove('session');
      return respondFast(null);
    }
    return respondFast(decorateStudent(student));
  },

  /** Sign out and clear the local session. */
  async logout() {
    remove('session');
    return respondFast({ ok: true });
  },
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

export const users = {
  /** Full profile for a student id. */
  async get(id) {
    return respond(decorateStudent(db.find('students', id)));
  },

  /** Look up by student ID (exact match, accent/space insensitive). */
  async getByStudentId(studentId) {
    const code = normalizeSearch(studentId).replace(/\s+/g, '');
    const student = db.table('students').find((s) => s.studentId === code);
    return respond(decorateStudent(student));
  },

  /**
   * Update the profile. Only `bio` is writable; everything else is rejected
   * even if a crafted request tries to pass it.
   */
  async updateProfile(patch) {
    const userId = requireUser();
    const student = db.find('students', userId);

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
    return respond(decorateStudent(db.find('students', userId)));
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

  /** Toggle a like. Reacting with the same vote again removes it. */
  async toggleLike(id) {
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
    if (!doc) return respond(null, { fail: true, error: 'Tài liệu không tồn tại.' });
    db.upsert('documents', { id, downloads: doc.downloads + 1 });
    return respond(decorateDocument(db.find('documents', id), currentUserId()));
  },

  /** Toggle a "useful" reaction. */
  async toggleLike(id) {
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
   * Search by student ID. Exact match — this is the primary lookup path.
   */
  async search({ studentId }) {
    const code = normalizeSearch(studentId).replace(/\s+/g, '');
    if (!code) {
      return respond(null, { fail: true, error: 'Vui lòng nhập mã sinh viên.' });
    }

    const student = db.table('students').find((s) => s.studentId === code);
    if (!student) {
      return respond(null, {
        fail: true,
        error: `Không tìm thấy sinh viên với mã ${code}.`,
      });
    }

    return respond(decorateRelationship(student));
  },

  /** Accepted friends + pending requests, both directions. */
  async list() {
    const userId = requireUser();
    const rows = db.table('friendships');
    const mine = rows.filter((f) => f.from === userId || f.to === userId);

    const accepted = mine
      .filter((f) => f.status === 'accepted')
      .map((f) => decorateStudent(db.find('students', f.from === userId ? f.to : f.from)));

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
    requireUser();
    db.removeRow('friendships', friendshipId);
    return respond({ ok: true });
  },

  /** Unfriend. */
  async remove({ studentId }) {
    const userId = requireUser();
    const friendship = db
      .table('friendships')
      .find((f) => (f.from === userId && f.to === studentId) || (f.from === studentId && f.to === userId));
    if (friendship) db.removeRow('friendships', friendship.id);
    return respond({ ok: true });
  },
};

/** Add relationship state to a decorated student. */
function decorateRelationship(student) {
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
  /** Conversation list for the current user. */
  async list() {
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

  /** Mark every message in a conversation as read. */
  async markRead(conversationId) {
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

function decorateMessage(message, conversation, viewerId) {
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

export const notificationsApi = {
  async list() {
    const rows = [...db.table('notifications')].sort((a, b) => b.createdAt - a.createdAt);
    return respond(rows.map((n) => ({ ...db.detach(n), relativeTime: timeAgo(n.createdAt) })));
  },

  async unreadCount() {
    return respondFast(db.table('notifications').filter((n) => !n.read).length);
  },

  async markRead(id) {
    db.upsert('notifications', { id, read: true });
    return respondFast({ ok: true });
  },

  async markAllRead() {
    db.table('notifications').forEach((n) => {
      n.read = true;
    });
    db.persist();
    return respondFast({ ok: true });
  },

  async remove(id) {
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
    const student = db.find('students', userId);

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

    const friendCount = acceptedFriendIds(userId).length;
    const myPosts = db.table('posts').filter((p) => p.authorId === userId).length;
    const sharedDocs = db.table('documents').filter((d) => d.authorId === userId).length;

    const totalUnreadMessages = db
      .table('conversations')
      .filter((c) => c.memberIds.includes(userId))
      .reduce(
        (sum, c) =>
          sum +
          c.messages.filter((m) => m.senderId !== userId && m.status !== 'read').length,
        0
      );

    const notificationsUnread = db.table('notifications').filter((n) => !n.read).length;

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