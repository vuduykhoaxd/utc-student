/**
 * Backend transport
 * ---------------------------------------------------------------------------
 * Talks to the Node backend instead of the portal itself.
 *
 * The portal hands out its session cookie with `Access-Control-Allow-Origin: *`,
 * and a wildcard origin makes the browser refuse the credentialed response — so
 * a GitHub Pages build can never keep the `.Auth` cookie. The backend solves
 * this by holding the cookie server-side and handing the browser its own token.
 * See docs/utc-protocol.md.
 *
 * This module owns that second transport. `utc-client.js` picks between the two
 * based on `MODE`, so both code paths stay readable side by side.
 */

import { BASE_URL, MODE, REQUEST_TIMEOUT, SESSION_MAX_AGE } from './config.js';

/** Local key mirrors the direct-mode client so a mode switch keeps the user in. */
const SESSION_KEY = 'utc:session';

/** Mirrors UtcApiError in utc-client.js so callers can `instanceof` either way. */
export class ProxyApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK' } = {}) {
    super(message);
    this.name = 'UtcApiError';
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Session storage                                                             */
/* -------------------------------------------------------------------------- */

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode, quota, disabled storage — the session simply won't survive */
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Call the backend.
 *
 * The access token rides in the Authorization header rather than a cookie, so
 * `credentials: 'include'` is not required. That is deliberate: a bearer token
 * keeps the API usable from a static host with no server-side session store and
 * no CSRF surface.
 */
/**
 * Short-lived read cache.
 *
 * Switching tabs remounts a page, and every page refetches the same lists it
 * had a second ago. A small TTL absorbs those repeat reads without letting a
 * view go stale: any write clears the whole cache, so a mutation is visible on
 * the very next read.
 */
const GET_TTL_MS = 20_000;
const GET_CACHE_MAX = 80;
const getCache = new Map();

function cachedRead(path, token) {
  const key = `${token ?? ''}|${path}`;
  const hit = getCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > GET_TTL_MS) {
    getCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function rememberRead(path, token, value) {
  const key = `${token ?? ''}|${path}`;
  if (getCache.size >= GET_CACHE_MAX) {
    // Oldest insertion first; Map keeps insertion order.
    getCache.delete(getCache.keys().next().value);
  }
  getCache.set(key, { at: Date.now(), value });
}

async function api(path, { method = 'GET', body, token, signal, cache = true } = {}) {
  const useCache = method === 'GET' && cache !== false;

  if (useCache) {
    const hit = cachedRead(path, token);
    if (hit !== undefined) return hit;
  } else if (method !== 'GET') {
    // A write invalidates every read taken before it.
    getCache.clear();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ProxyApiError('Máy chủ phản hồi quá chậm. Vui lòng thử lại.', {
        code: 'TIMEOUT',
      });
    }
    throw new ProxyApiError(
      'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.',
      { code: 'NETWORK' }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body, e.g. a proxy error page */
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      (payload?.error?.code === 'ORIGIN_NOT_ALLOWED'
        ? 'Máy chủ chưa cho phép tên miền này truy cập.'
        : `Máy chủ trả về lỗi ${response.status}.`);

    throw new ProxyApiError(message, {
      status: response.status,
      code: payload?.error?.code || 'HTTP_ERROR',
    });
  }

  const data = payload?.data ?? payload;
  if (useCache) rememberRead(path, token, data);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Sign in.
 *
 * The backend returns `{ token, user, session }`; this normalises `user` into
 * the same `identity` shape the direct client produces so the rest of the app
 * does not care which transport ran.
 */
export async function login({ username, password, remember = true }) {
  const studentId = String(username ?? '').trim();
  const secret = String(password ?? '');

  if (!studentId || !secret) {
    throw new ProxyApiError('Vui lòng nhập mã sinh viên và mật khẩu.', { code: 'VALIDATION' });
  }

  const data = await api('/api/auth/login', {
    method: 'POST',
    body: { studentId, password: secret },
  });

  const identity = normaliseUser(data?.user, studentId);

  writeSession({
    token: data.token,
    identity,
    remember,
    signedInAt: Date.now(),
    expiresAt: Date.parse(data?.session?.expiresAt ?? '') || null,
  });

  return { token: data.token, identity };
}

/** Return the stored session if it has not obviously expired. */
export async function restoreSession() {
  const session = readSession();
  if (!session?.token) return null;

  if (session.expiresAt && session.expiresAt < Date.now()) {
    clearSession();
    return null;
  }

  /**
   * Ask the backend rather than trusting local state. A token that died with the
   * server (restart, redeploy, manual sign-out elsewhere) should not keep the
   * UI showing a signed-in shell that fails on the first real request.
   */
  try {
    const data = await api('/api/auth/me', { token: session.token });
    const identity = normaliseUser(data?.user, session.identity?.studentId ?? '');
    writeSession({ ...session, identity });
    return { token: session.token, identity };
  } catch (error) {
    if (error.code === 'UNAUTHENTICATED' || error.status === 401) {
      clearSession();
      return null;
    }
    throw error;
  }
}

/** End the session. Always clears locally, even if the server is unreachable. */
export async function logout() {
  const session = readSession();
  clearSession();

  if (!session?.token) return;
  try {
    await api('/api/auth/logout', { method: 'POST', token: session.token });
  } catch {
    /* the local session is already gone; a stale server session expires on its own */
  }
}

/**
 * Change the portal password.
 *
 * Field names match the portal's own form, which the backend forwards verbatim.
 * Every rule that can be checked locally is checked here so an obviously bad
 * request never costs a round trip.
 */
export async function changePassword({ oldPassword, newPassword, retypePassword }) {
  const oldPass = String(oldPassword ?? '');
  const newPass = String(newPassword ?? '');
  const retype = String(retypePassword ?? '');

  if (!oldPass || !newPass || !retype) {
    throw new ProxyApiError('Vui lòng điền đủ cả ba ô.', { code: 'VALIDATION' });
  }
  if (newPass !== retype) {
    throw new ProxyApiError('Mật khẩu mới không khớp với ô xác nhận.', { code: 'MISMATCH' });
  }
  if (newPass === oldPass) {
    throw new ProxyApiError('Mật khẩu mới phải khác mật khẩu hiện tại.', { code: 'SAME' });
  }

  const data = await api('/api/auth/change-password', {
    method: 'POST',
    token: readSession()?.token,
    body: {
      oldPassword: oldPass,
      newPassword: newPass,
      retypePassword: retype,
    },
  });

  return { message: data?.message || 'Đổi mật khẩu thành công.' };
}

/* -------------------------------------------------------------------------- */
/* Study                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Today as yyyy-MM-dd in **local** time.
 *
 * `toISOString()` converts to UTC first, which in UTC+7 reports yesterday for
 * anything before 07:00 — enough to mark the wrong day as "today".
 *
 * @returns {string}
 */
function todayLocal() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Fetch one week of timetable.
 *
 * @param {number} weekOffset 0 = this week, 1 = next, -1 = last
 */
export async function schedule({ weekOffset = 0 } = {}) {
  const token = readSession()?.token;

  const data = await api(`/api/study/schedule?weekOffset=${encodeURIComponent(weekOffset)}`, {
    token,
  });

  const today = todayLocal();

  return {
    weekOffset: data.weekOffset,
    from: data.from,
    to: data.to,
    total: data.total,

    /**
     * Distinguishes "no classes this week" from "the school has not published
     * this far ahead". Dropping these would make every empty week look like the
     * student has a free timetable.
     */
    hasData: data.hasData !== false,
    beyondTerm: Boolean(data.beyondTerm),

    days: (data.days ?? []).map((day) => ({
      date: day.date,
      weekday: day.weekday,
      /** Convenience flag so the page can highlight today without date maths. */
      isToday: day.date === today,
      sessions: day.sessions ?? [],
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* News                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A page of school announcements.
 *
 * @param {{page?: number, pageSize?: number, q?: string,
 *          from?: string, to?: string, publisher?: string}} params
 */
export async function news({ page = 1, pageSize = 20, q = '', from, to, publisher } = {}) {
  const token = readSession()?.token;

  const params = new URLSearchParams({ page, pageSize });
  if (q) params.set('q', q);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (publisher) params.set('publisher', publisher);

  const data = await api(`/api/study/news?${params}`, { token });

  return {
    page: data.page,
    pageSize: data.pageSize,
    total: data.total,
    items: (data.items ?? []).map(decorateNews),
  };
}

/** One announcement, including its body. */
export async function newsDetail(id) {
  const token = readSession()?.token;
  const data = await api(`/api/study/news/${encodeURIComponent(id)}`, { token });
  return decorateNews(data);
}

/** Publishers, for the filter control. */
export async function newsPublishers() {
  const token = readSession()?.token;
  const data = await api('/api/study/news/publishers', { token });
  return data.items ?? [];
}

/**
 * Give a portal record the shape the news page already renders.
 *
 * Field names are aligned to the local dataset's so `news.js` needs no changes
 * beyond its data source: `excerpt` and `category` are what it reads today.
 */
function decorateNews(item) {
  if (!item) return null;

  const published = item.publishedAt ? new Date(item.publishedAt) : null;

  return {
    id: item.id,
    title: item.title,
    excerpt: item.summary ?? null,

    /** Present only on the detail call. */
    body: item.content ?? null,

    author: item.author ?? item.publisher ?? 'Nhà trường',
    publisher: item.publisher ?? null,
    publisherId: item.publisherId ?? null,

    category: item.category ?? 'Thông báo',
    pinned: Boolean(item.pinned),
    active: item.active !== false,

    publishedAt: item.publishedAt,
    publishedDay: item.publishedDay,
    publishedTs: published && !Number.isNaN(published.getTime()) ? published.getTime() : null,

    validFrom: item.validFrom ?? null,
    validTo: item.validTo ?? null,

    /** The local dataset has no per-user flags; these keep the UI code uniform. */
    isRead: false,
    views: 0,
    likes: 0,
    comments: 0,
    tags: [],

    /** Lets the UI suppress counters the portal does not actually provide. */
    source: 'utc',
  };
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shape the backend's user record like the direct client's identity.
 *
 * The backend has already flattened the portal's many field names, so this only
 * has to bridge the two vocabularies. Each field falls back independently: a
 * student with no recorded email still gets a name.
 */
function normaliseUser(user, fallbackId) {
  const source = user ?? {};
  const studentId = source.studentId || source.studentID || fallbackId || '';
  const fullName = source.fullName || source.HoTen || studentId;

  return {
    /**
     * The server-assigned id. Every write — a post, a message, a friendship —
     * is keyed on it, so a client that derived its own would be writing to
     * records nothing reads.
     */
    id: source.id ?? (studentId ? `u:${studentId}` : null),
    fullName,
    studentId,
    email: source.email || null,
    phone: source.phone || null,
    faculty: source.faculty || null,
    major: source.major || null,
    className: source.className || null,
    cohort: source.cohort || null,
    birthDate: source.birthDate || null,
    gender: source.gender || null,
    address: source.address || null,
    avatarIndex: Number(source.avatarIndex) || 0,
    avatar: source.avatar || null,

    /**
     * Initials for the fallback avatar. Derived here so every surface shows the
     * same thing without re-implementing the Vietnamese diacritic rules.
     */
    initials: initialsOf(fullName),
  };
}

/** First letters of the first and last word, e.g. "Nguyễn Văn A" -> "NA". */
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
/* Social: users, friends, chat, posts, documents                             */
/* -------------------------------------------------------------------------- */

/** The signed-in student's own backend record. */
export async function me() {
  const token = readSession()?.token;
  const data = await api('/api/users/me', { token });
  return normaliseUser(data, data?.studentId ?? '');
}

/** Look up a student by code, with the relationship to the caller. */
export async function findStudent(studentId) {
  const token = readSession()?.token;
  const data = await api(`/api/users/by-student-id/${encodeURIComponent(studentId)}`, { token });
  return normaliseUser(data, data?.studentId ?? '');
}

/** Accepted friends, pending requests, and suggestions. */
export async function friends() {
  const token = readSession()?.token;
  const data = await api('/api/community/friends', { token });

  /**
   * `friendshipId` rides along on each row.
   *
   * Dropping it would force the UI to search for the student again just to
   * learn which request to accept.
   */
  const rows = (list) => (list ?? []).map((f) => ({ ...normaliseUser(f), friendshipId: f.friendshipId ?? null }));

  return {
    accepted: rows(data.accepted),
    incoming: rows(data.incoming),
    outgoing: rows(data.outgoing),
    suggestions: rows(data.suggestions),
  };
}

/** Search a student and get the relationship in one round trip. */
export async function searchFriend(studentId) {
  const token = readSession()?.token;
  const data = await api(`/api/community/friends/search?studentId=${encodeURIComponent(studentId)}`, { token });

  return {
    ...normaliseUser(data, data?.studentId ?? ''),
    relation: data?.relation ?? 'none',
    friendshipId: data?.friendshipId ?? null,
    mutualCount: data?.mutualCount ?? 0,
    isSelf: Boolean(data?.isSelf),
  };
}

export async function sendFriendRequest(studentId) {
  const token = readSession()?.token;
  const data = await api('/api/community/friends/requests', {
    method: 'POST',
    token,
    body: { studentId },
  });
  return normaliseUser(data, data?.studentId ?? '');
}

export async function acceptFriendRequest(friendshipId) {
  const token = readSession()?.token;
  const data = await api(`/api/community/friends/requests/${encodeURIComponent(friendshipId)}/accept`, {
    method: 'POST',
    token,
  });
  return normaliseUser(data, data?.studentId ?? '');
}

export async function declineFriendRequest(friendshipId) {
  const token = readSession()?.token;
  await api(`/api/community/friends/requests/${encodeURIComponent(friendshipId)}/decline`, {
    method: 'POST',
    token,
  });
  return { ok: true };
}

export async function removeFriend(studentId) {
  const token = readSession()?.token;
  await api(`/api/community/friends/${encodeURIComponent(studentId)}`, { method: 'DELETE', token });
  return { ok: true };
}

/* --------------------------------- Chat ---------------------------------- */

/** The caller's conversations, most recently active first. */
export async function conversations() {
  const token = readSession()?.token;
  const data = await api('/api/community/chat', { token, cache: false });
  return (Array.isArray(data) ? data : []).map(decorateConversation);
}

export async function conversationMessages(conversationId) {
  const token = readSession()?.token;
  const data = await api(`/api/community/chat/${encodeURIComponent(conversationId)}/messages`, { token, cache: false });
  return (Array.isArray(data) ? data : []).map((m) => decorateMessage(m, conversationId));
}

export async function sendMessage(conversationId, { text, attachments = [] } = {}) {
  const token = readSession()?.token;
  const data = await api(`/api/community/chat/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    token,
    body: { text, attachments },
  });
  return decorateMessage(data, conversationId);
}

export async function openDirectChat(studentId) {
  const token = readSession()?.token;
  const data = await api('/api/community/chat/direct', {
    method: 'POST',
    token,
    body: { studentId },
  });
  return decorateConversation(data);
}

export async function createGroupChat({ title, memberIds = [] } = {}) {
  const token = readSession()?.token;
  const data = await api('/api/community/chat/groups', {
    method: 'POST',
    token,
    body: { title, memberIds },
  });
  return decorateConversation(data);
}

export async function markConversationRead(conversationId) {
  const token = readSession()?.token;
  await api(`/api/community/chat/${encodeURIComponent(conversationId)}/read`, { method: 'POST', token });
  return { ok: true };
}

/**
 * Upload a file to attach to a message.
 *
 * FormData is built by hand rather than reused, because the request has to
 * carry the Authorization header — and a bare <form> cannot set one.
 */
export async function uploadAttachment(conversationId, file) {
  const token = readSession()?.token;

  const form = new FormData();
  form.set('file', file, file.name);

  const response = await fetch(
    `${BASE_URL}/api/community/chat/${encodeURIComponent(conversationId)}/attachments`,
    { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form }
  );

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* a proxy error page rather than our JSON */
  }

  if (!response.ok) {
    throw new ProxyApiError(
      payload?.error?.message || `Không gửi được tệp (${response.status}).`,
      { status: response.status, code: payload?.error?.code || 'HTTP_ERROR' }
    );
  }

  return payload?.data;
}

/**
 * Resolve an attachment path against the backend origin.
 *
 * The server sends `/api/community/attachments/<id>`. Fetched as-is that
 * would hit the frontend's own origin, where the endpoint does not exist — so
 * a relative URL has to become absolute before it leaves this module.
 */
function attachmentEndpoint(url) {
  if (!url) return null;
  return /^https?:/i.test(url) ? url : `${BASE_URL}${url}`;
}

/**
 * Fetch an attachment as a blob URL.
 *
 * Images cannot use a plain `src`: the download needs the session header, and
 * an <img> cannot send one.
 */
const objectUrls = new Map();

export async function attachmentUrl(attachment) {
  const endpoint = attachmentEndpoint(attachment?.url);
  if (!attachment?.id || !endpoint) return null;
  if (objectUrls.has(attachment.id)) return objectUrls.get(attachment.id);

  const token = readSession()?.token;
  const response = await fetch(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) return null;

  const url = URL.createObjectURL(await response.blob());
  objectUrls.set(attachment.id, url);
  return url;
}

/** Download an attachment under its own name. */
export async function downloadAttachment(attachment) {
  const endpoint = attachmentEndpoint(attachment?.url);
  if (!endpoint) return { ok: false };

  const token = readSession()?.token;

  const response = await fetch(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ProxyApiError('Không tải được tệp.', { status: response.status });
  }

  const url = URL.createObjectURL(await response.blob());

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.fileName || 'tai-lieu';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}

/* --------------------------------- Posts --------------------------------- */

/**
 * The feed.
 *
 * `scope: 'friends'` restricts to accepted friends, which is the privacy
 * setting the feed actually enforces.
 */
export async function posts({ scope = 'all', limit = 30 } = {}) {
  const token = readSession()?.token;
  const data = await api(`/api/community/posts?scope=${encodeURIComponent(scope)}&limit=${limit}`, { token });
  return (Array.isArray(data) ? data : []).map(decoratePost);
}

export async function createPost(content) {
  const token = readSession()?.token;
  const data = await api('/api/community/posts', { method: 'POST', token, body: { content } });
  return decoratePost(data);
}

export async function deletePost(postId) {
  const token = readSession()?.token;
  await api(`/api/community/posts/${encodeURIComponent(postId)}`, { method: 'DELETE', token });
  return { ok: true };
}

export async function togglePostLike(postId, kind = 'like') {
  const token = readSession()?.token;
  const data = await api(`/api/community/posts/${encodeURIComponent(postId)}/${kind}`, {
    method: 'POST',
    token,
  });
  return decoratePost(data);
}

export async function addPostComment(postId, text) {
  const token = readSession()?.token;
  const data = await api(`/api/community/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    token,
    body: { text },
  });
  return decoratePost(data);
}

/* ------------------------------- Documents -------------------------------- */

/**
 * The shared library.
 *
 * A multipart body is built by hand rather than with FormData, so the request
 * carries the Authorization header on every browser that supports it.
 */
export async function documents({
  query = '',
  courseId = 'all',
  fileType = 'all',
  semester = 'all',
  sort = 'newest',
  page = 1,
  pageSize = 9,
} = {}) {
  const token = readSession()?.token;
  const params = new URLSearchParams({ query, courseId, fileType, semester, sort, page, pageSize });
  const data = await api(`/api/community/documents?${params}`, { token });

  return {
    items: (data?.items ?? []).map(decorateDocument),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? pageSize,
    totalPages: data?.totalPages ?? 1,
    facets: {
      fileTypes: data?.facets?.fileTypes ?? {},
      courses: data?.facets?.courses ?? [],
      semesters: data?.facets?.semesters ?? [],
    },
  };
}

/** Upload a file as multipart. */
export async function uploadDocument({ title, description, courseId, semester, tags, file }) {
  const token = readSession()?.token;

  const form = new FormData();
  form.set('title', String(title ?? ''));
  form.set('description', String(description ?? ''));
  if (courseId) form.set('courseId', String(courseId));
  if (semester) form.set('semester', String(semester));
  if (tags?.length) form.set('tags', tags.join(','));
  if (file) form.set('file', file, file.name);

  const response = await fetch(BASE_URL + '/api/community/documents', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* a proxy error page rather than our JSON */
  }

  if (!response.ok) {
    throw new ProxyApiError(
      payload?.error?.message || `Máy chủ trả về lỗi ${response.status}.`,
      { status: response.status, code: payload?.error?.code || 'HTTP_ERROR' }
    );
  }

  return decorateDocument(payload?.data);
}

/**
 * Download a document and count the hit.
 *
 * The token rides in a header, so the response is fetched and turned into an
 * object URL: a plain <a href> could not authenticate.
 */
export async function downloadDocument(docId, fileName) {
  const token = readSession()?.token;

  const response = await fetch(
    `${BASE_URL}/api/community/documents/${encodeURIComponent(docId)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );

  if (!response.ok) {
    let message = `Không tải được tài liệu (${response.status}).`;
    try {
      const payload = await response.json();
      message = payload?.error?.message ?? message;
    } catch {
      /* keep the default message */
    }
    throw new ProxyApiError(message, { status: response.status });
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'tai-lieu';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoke on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}

export async function toggleDocumentLike(docId) {
  const token = readSession()?.token;
  const data = await api(`/api/community/documents/${encodeURIComponent(docId)}/like`, {
    method: 'POST',
    token,
  });
  return decorateDocument(data);
}

export async function deleteDocument(docId) {
  const token = readSession()?.token;
  await api(`/api/community/documents/${encodeURIComponent(docId)}`, { method: 'DELETE', token });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/** The caller's notices, newest first. */
export async function notifications() {
  const token = readSession()?.token;
  const data = await api('/api/notifications', { token, cache: false });
  return (Array.isArray(data) ? data : []).map(decorateNotification);
}

/** Just the bell's number — cheaper than fetching the whole inbox. */
export async function unreadNotificationCount() {
  const token = readSession()?.token;
  const data = await api('/api/notifications/unread-count', { token, cache: false });
  return data?.count ?? 0;
}

export async function markNotificationRead(id) {
  const token = readSession()?.token;
  await api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', token });
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const token = readSession()?.token;
  return api('/api/notifications/read-all', { method: 'POST', token });
}

export async function deleteNotification(id) {
  const token = readSession()?.token;
  await api(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  return { ok: true };
}

/** Give a notice the fields the page renders. */
function decorateNotification(item) {
  if (!item) return null;
  return {
    id: item.id,
    category: item.category ?? 'news',
    title: item.title,
    message: item.message ?? '',
    route: item.route ?? '/notifications',
    read: Boolean(item.read),
    createdAt: ts(item.createdAt),
    conversationId: item.conversationId ?? null,
    actorId: item.actorId ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Decorators: backend shapes -> what the pages already render                 */
/* -------------------------------------------------------------------------- */

/** Timestamps are epoch ms everywhere, matching the local dataset. */
function ts(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function decorateConversation(conversation) {
  if (!conversation) return null;
  return {
    ...conversation,
    messages: undefined,
    lastMessageAt: ts(conversation.lastMessageAt ?? conversation.createdAt),
    createdAt: ts(conversation.createdAt),
    lastMessage: conversation.lastMessage
      ? decorateMessage(conversation.lastMessage, conversation.id)
      : null,
    members: (conversation.members ?? []).map((m) => normaliseUser(m)),
    peer: conversation.peer ? normaliseUser(conversation.peer) : null,
  };
}

function decorateMessage(message, conversationId) {
  if (!message) return null;
  return {
    ...message,
    sender: normaliseUser(message.sender),
    isOwn: Boolean(message.isOwn),
    conversationId: message.conversationId ?? conversationId,
    createdAt: ts(message.createdAt),
  };
}

function decoratePost(post) {
  if (!post) return null;
  return {
    ...post,
    createdAt: ts(post.createdAt),
    author: normaliseUser(post.author),
    comments: (post.comments ?? []).map((c) => ({
      ...c,
      createdAt: ts(c.createdAt),
      author: normaliseUser(c.author),
    })),
  };
}

function decorateDocument(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: ts(doc.createdAt),
    author: normaliseUser(doc.author),
  };
}

export const isLive = true;
export { BASE_URL, MODE, SESSION_MAX_AGE };