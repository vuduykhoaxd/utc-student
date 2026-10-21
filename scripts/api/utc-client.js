/**
 * UTC API client
 * ---------------------------------------------------------------------------
 * Implements the portal's sign-in, session and change-password flow in the
 * browser, exactly as the verified Python reference does.
 *
 *   Sign in
 *     1. GET  /congthongtin/login.aspx        -> __VIEWSTATE / __VIEWSTATEGENERATOR /
 *                                                 __EVENTVALIDATION
 *     2. POST /congthongtin/login.aspx        -> 302 + two `.Auth` cookies
 *     3. GET  /congthongtin/Index.aspx        -> AXYZCLRVN() returns an
 *                                                 obfuscated tokenJWT
 *     4. Base64-decode it, XOR with "AzzS"    -> JSON -> tokenJWT
 *
 *   Change password
 *     GET  /congthongtin/Pages/ChangePass.aspx  -> hidden fields
 *     POST /congthongtin/Pages/ChangePass.aspx  -> old_password / new_password /
 *                                                   retype_password + hidden fields
 *
 * `crypto.js` holds the XOR/Base64 primitives, verified byte-for-byte against
 * the Python reference (including a character outside the BMP).
 */

import {
  BASE_URL,
  MODE,
  PATHS,
  REFERER,
  USE_CREDENTIALS,
  SESSION_MAX_AGE,
  REQUEST_TIMEOUT,
} from './config.js';

import * as proxy from './proxy-client.js';
import { decryptJson, JWT_KEY } from './crypto.js';

const SESSION_KEY = 'utc:session';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class UtcApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR' } = {}) {
    super(message);
    this.name = 'UtcApiError';
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* HTML helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pull every hidden input out of an ASP.NET page.
 *
 * Uses DOMParser rather than a regex: __VIEWSTATE values are long, can contain
 * `>`, `<`, quotes and are HTML-encoded, and a naive pattern breaks on them.
 *
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function parseHiddenFields(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fields = {};

  for (const input of doc.querySelectorAll('input[type="hidden"][name]')) {
    fields[input.getAttribute('name')] = input.value ?? '';
  }

  return fields;
}

/** Strip tags + entities and collapse whitespace, for scraping portal messages. */
function textOf(html, selector) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const node = selector ? doc.querySelector(selector) : doc.body;
  return (node?.textContent ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull a human-readable error out of a portal response.
 * WebForms puts validation messages in a handful of well-known places.
 */
function portalError(html, fallback) {
  const candidates = [
    '#lblMessage', '#lblError', '#lblThongBao', '.error-message', '.validation-summary-errors',
    '[id*="Message"]', '[id*="Error"]', '[id*="ThongBao"]',
  ];

  for (const selector of candidates) {
    const value = textOf(html, selector);
    if (value && value.length < 200) return value;
  }

  // A rejected sign-in re-renders the login page with the message inline.
  if (/Đăng nhập không thành công|Tên đăng nhập|Mật khẩu không đúng/i.test(html)) {
    const inline = html.match(/(?:Sai|không đúng|không thành công)[^<]{0,120}/i);
    if (inline) return inline[0].trim();
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Identity normalisation                                                      */
/* -------------------------------------------------------------------------- */

/** First non-empty value among several possible field names. */
function pick(source, ...keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

/**
 * Flatten the many shapes a student record can arrive in — the portal spells
 * things `HOTEN` / `MSSV`, a hand-written backend would use `fullName` /
 * `studentId` — so the rest of the app never has to care.
 */
export function normaliseIdentity(raw, username) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const person = source.user ?? source.student ?? source.data ?? source;

  const fullName =
    pick(person, 'fullName', 'full_name', 'name', 'HoTen', 'HOTEN', 'ho_ten') ??
    username ??
    'Sinh viên';

  const studentId =
    pick(person, 'studentId', 'student_id', 'mssv', 'MSSV', 'maSinhVien', 'MaSinhVien') ??
    username ??
    '';

  return {
    fullName,
    studentId,
    email: pick(person, 'email', 'Email', 'EMAIL', 'schoolEmail'),
    phone: pick(person, 'phone', 'Phone', 'dienThoai', 'SDT'),
    faculty: pick(person, 'faculty', 'khoa', 'Khoa', 'KHOA', 'donVi'),
    major: pick(person, 'major', 'nganh', 'Nganh', 'NGANH', 'chuyenNganh'),
    className: pick(person, 'className', 'class_name', 'lop', 'Lop', 'LOP', 'tenLop'),
    cohort: pick(person, 'cohort', 'khoaHoc', 'KHOAHOC', 'year'),
    birthDate: pick(person, 'birthDate', 'ngaySinh', 'NGAYSINH'),
    address: pick(person, 'address', 'diaChi', 'DIACHI'),
    scholar: pick(person, 'scholar', 'hocBong', 'HOCBONG') ?? '',
    portalUserId: pick(person, 'userId', 'id', 'strNguoiThucHien_Id', 'nguoiThucHienId'),
    avatarIndex: Number(pick(person, 'avatarIndex') ?? 0) || 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Session storage                                                            */
/* -------------------------------------------------------------------------- */

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.signedInAt || Date.now() - parsed.signedInAt > SESSION_MAX_AGE) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Bearer token for the current session, or null. */
export function currentToken() {
  return readSession()?.token ?? null;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One request to the portal.
 *
 * `redirect: 'manual'` matters: the sign-in POST answers 302, and letting the
 * browser follow it silently would hide the response we need to inspect.
 */
async function request(path, { method = 'GET', form = null, headers = {}, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const init = {
    method,
    redirect,
    signal: controller.signal,
    credentials: USE_CREDENTIALS ? 'include' : 'omit',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json,*/*',
      'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
      ...headers,
    },
  };

  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }

  try {
    return await fetch(`${BASE_URL}${path}`, init);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new UtcApiError('Máy chủ phản hồi quá chậm. Vui lòng thử lại.', { code: 'TIMEOUT' });
    }
    throw new UtcApiError(
      `Không kết nối được tới ${BASE_URL}. Kiểm tra mạng hoặc cấu hình MODE trong scripts/api/config.js.`,
      { code: 'NETWORK' }
    );
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Sign in                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Extract the obfuscated token the portal embeds on Index.aspx.
 *
 * The page ships `AXYZCLRVN = () => "..."`; the value is Base64 of an XOR
 * string that decodes to JSON holding `tokenJWT`.
 */
export function extractToken(html) {
  // Tolerate arbitrary whitespace: the real page emits `() => "..."` but a
  // minified or re-formatted variant should not break sign-in.
  const match = html.match(/AXYZCLRVN\s*=\s*\(\s*\)\s*=>\s*"([^"]*)"/);

  if (!match) {
    throw new UtcApiError(
      'Không tìm thấy token trong phản hồi của máy chủ. Có thể phiên đăng nhập đã hết hạn.',
      { code: 'NO_TOKEN_MARKER' }
    );
  }

  if (!match[1]) {
    throw new UtcApiError(
      'Máy chủ không cấp token cho tài khoản này. Tài khoản có thể chưa được cấp quyền sinh viên.',
      { code: 'EMPTY_TOKEN' }
    );
  }

  let payload;
  try {
    payload = decryptJson(match[1], JWT_KEY);
  } catch {
    throw new UtcApiError('Không giải mã được token do máy chủ trả về.', { code: 'BAD_TOKEN' });
  }

  const token = payload?.tokenJWT;
  if (!token) {
    throw new UtcApiError('Token không chứa trường tokenJWT.', { code: 'NO_TOKEN' });
  }

  return { token, payload };
}

/**
 * Sign in against the portal.
 *
 * @param {{username: string, password: string, remember?: boolean}} credentials
 * @returns {Promise<{token: string, identity: object}>}
 */
async function directLogin({ username, password, remember = true }) {
  const user = String(username ?? '').trim();
  const pass = String(password ?? '');

  if (!user || !pass) {
    throw new UtcApiError('Vui lòng nhập mã sinh viên và mật khẩu.', { code: 'VALIDATION' });
  }

  /* --- 1. Fetch the form and its anti-forgery state --- */
  const formPage = await request(PATHS.login);
  if (!formPage.ok) {
    throw new UtcApiError(`Không mở được trang đăng nhập (${formPage.status}).`, {
      status: formPage.status,
      code: 'LOGIN_PAGE',
    });
  }

  const formHtml = await formPage.text();
  const hidden = parseHiddenFields(formHtml);

  for (const required of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
    if (!(required in hidden)) {
      throw new UtcApiError(
        `Trang đăng nhập không có trường ẩn "${required}". Cấu trúc trang có thể đã thay đổi.`,
        { code: 'MISSING_VIEWSTATE' }
      );
    }
  }

  /* --- 2. Submit the credentials --- */
  const loginResponse = await request(PATHS.login, {
    method: 'POST',
    redirect: 'manual',
    form: {
      username: user,
      password: pass,
      cms_authenticate_do_login: 'ĐĂNG NHẬP',
      ...hidden,
    },
  });

  /**
   * The portal answers a good sign-in with 302 + `.Auth` cookies.
   *
   * Cross-origin, the browser turns that 302 into an *opaque redirect*: the
   * response has `status 0`, `type 'opaqueredirect'`, and no readable body or
   * headers. So we cannot tell "wrong password" apart from "redirected" by
   * status alone — but an opaque redirect is unambiguous evidence that the
   * portal DID accept the credentials and handed out a cookie we are not
   * allowed to keep. That is a transport problem, not a bad password, and the
   * message has to say so.
   */
  const opaque = loginResponse.type === 'opaqueredirect' || loginResponse.status === 0;

  if (opaque && MODE === 'direct') {
    throw new UtcApiError(
      'Đăng nhập đã được máy chủ chấp nhận, nhưng trình duyệt không lưu được cookie phiên ' +
        '(máy chủ trả Access-Control-Allow-Origin: * nên không cho gửi cookie). ' +
        'Đổi MODE trong scripts/api/config.js sang "proxy", hoặc nhờ nhà trường bật ' +
        'Access-Control-Allow-Credentials.',
      { status: 0, code: 'SESSION_COOKIE_BLOCKED' }
    );
  }

  if (loginResponse.status >= 300 && loginResponse.status < 400) {
    // Real redirect, credentials accepted — fall through to collect the token.
  } else if (!loginResponse.ok) {
    throw new UtcApiError(portalError(await loginResponse.text(), 'Máy chủ từ chối yêu cầu đăng nhập.'), {
      status: loginResponse.status,
      code: 'LOGIN_REJECTED',
    });
  } else {
    const html = await loginResponse.text();
    throw new UtcApiError(
      portalError(html, 'Mã sinh viên hoặc mật khẩu không đúng.'),
      { status: loginResponse.status, code: 'BAD_CREDENTIALS' }
    );
  }

  /* --- 3. Collect the token from the landing page --- */
  const indexResponse = await request(PATHS.index, { headers: { Referer: REFERER } });
  const indexHtml = await indexResponse.text();

  const { token, payload } = extractToken(indexHtml);

  /* --- 4. Persist --- */
  const identity = normaliseIdentity(payload?.user ?? payload, user);

  writeSession({ token, identity, remember, signedInAt: Date.now() });

  return { token, identity };
}

/**
 * Restore a previous session from storage.
 * @returns {Promise<{token: string, identity: object}|null>}
 */
async function directRestoreSession() {
  const session = readSession();
  if (!session?.token) return null;
  return { token: session.token, identity: session.identity };
}

/* -------------------------------------------------------------------------- */
/* Change password                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Change the password on the portal.
 *
 * Field names are exactly those the portal's own form posts — verified against
 * a live ChangePass.aspx response.
 *
 * @param {{oldPassword: string, newPassword: string, retypePassword: string}} payload
 */
async function directChangePassword({ oldPassword, newPassword, retypePassword }) {
  const oldPass = String(oldPassword ?? '');
  const newPass = String(newPassword ?? '');
  const retype = String(retypePassword ?? '');

  if (!oldPass || !newPass || !retype) {
    throw new UtcApiError('Vui lòng điền đủ cả ba ô.', { code: 'VALIDATION' });
  }
  if (newPass !== retype) {
    throw new UtcApiError('Mật khẩu mới không khớp với ô xác nhận.', { code: 'MISMATCH' });
  }
  if (newPass === oldPass) {
    throw new UtcApiError('Mật khẩu mới phải khác mật khẩu hiện tại.', { code: 'SAME' });
  }

  /* --- 1. Read the form, which carries the anti-forgery state --- */
  const page = await request(PATHS.changePassword, { headers: { Referer: REFERER } });
  if (!page.ok) {
    // A redirect to the login page means the session is gone.
    throw new UtcApiError(
      page.status === 200
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử.'
        : `Không mở được trang đổi mật khẩu (${page.status}).`,
      { status: page.status, code: 'CHANGEPASS_PAGE' }
    );
  }

  const html = await page.text();
  const hidden = parseHiddenFields(html);

  if (!('__VIEWSTATE' in hidden)) {
    throw new UtcApiError(
      'Trang đổi mật khẩu không có trường ẩn __VIEWSTATE. Cấu trúc trang có thể đã thay đổi.',
      { code: 'MISSING_VIEWSTATE' }
    );
  }

  /* --- 2. Submit --- */
  const response = await request(PATHS.changePassword, {
    method: 'POST',
    headers: { Referer: `${BASE_URL}${PATHS.changePassword}` },
    form: {
      old_password: oldPass,
      new_password: newPass,
      retype_password: retype,
      ...hidden,
    },
  });

  const body = await response.text();

  // WebForms signals failure by re-rendering the page with the form still
  // present and a message; success redirects away from it.
  const stillOnForm = /name=["']new_password["']/.test(body);

  if (stillOnForm) {
    throw new UtcApiError(portalError(body, 'Máy chủ không chấp nhận mật khẩu mới.'), {
      status: response.status,
      code: 'CHANGE_FAILED',
    });
  }

  return { message: 'Đổi mật khẩu thành công.' };
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                             */
/* -------------------------------------------------------------------------- */

/** Clear the local session. */
function directLogout() {
  clearSession();
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pick a transport.
 *
 * `direct` talks to the portal and is kept because it documents the protocol
 * exactly, and because it fails with a precise diagnosis rather than a mystery.
 * `proxy` routes through the Node backend, which is the only one that can work
 * from a static host.
 */
const transport =
  MODE === 'proxy'
    ? {
        login: proxy.login,
        restoreSession: proxy.restoreSession,
        changePassword: proxy.changePassword,
        logout: proxy.logout,
        schedule: proxy.schedule,
        news: proxy.news,
        newsDetail: proxy.newsDetail,
        newsPublishers: proxy.newsPublishers,
      }
    : {
        login: directLogin,
        restoreSession: directRestoreSession,
        changePassword: directChangePassword,
        logout: directLogout,
      };

/** Sign in. */
export const login = transport.login;

/** Recover a session across reloads. */
export const restoreSession = transport.restoreSession;

/** Change the portal password. */
export const changePassword = transport.changePassword;

/** Sign out. */
export const logout = transport.logout;

/**
 * Live timetable, when the active transport can provide one.
 *
 * Returns null on the direct transport, which does not implement the API call —
 * callers fall back to the bundled dataset rather than showing an error.
 */
export const schedule =
  MODE === 'proxy'
    ? proxy.schedule
    : async () => {
        throw Object.assign(new Error('Chưa hỗ trợ.'), { code: 'UNSUPPORTED' });
      };

/** Live announcements. Same caveat as `schedule`. */
export const news = MODE === 'proxy' ? proxy.news : null;
export const newsDetail = MODE === 'proxy' ? proxy.newsDetail : null;
export const newsPublishers = MODE === 'proxy' ? proxy.newsPublishers : null;

/* -------------------------------------------------------------------------- */
/* Social                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Social features exist only on the backend.
 *
 * Direct mode talks to the portal, which has no user directory, no
 * friendships, and no message store — so there is nothing to fall back to. Each
 * export is null there, and the page keeps using its local dataset.
 */
const social = MODE === 'proxy' ? proxy : null;

export const me = social?.me ?? null;
export const findStudent = social?.findStudent ?? null;

export const friends = social?.friends ?? null;
export const searchFriend = social?.searchFriend ?? null;
export const sendFriendRequest = social?.sendFriendRequest ?? null;
export const acceptFriendRequest = social?.acceptFriendRequest ?? null;
export const declineFriendRequest = social?.declineFriendRequest ?? null;
export const removeFriend = social?.removeFriend ?? null;

export const conversations = social?.conversations ?? null;
export const conversationMessages = social?.conversationMessages ?? null;
export const sendMessage = social?.sendMessage ?? null;
export const openDirectChat = social?.openDirectChat ?? null;
export const createGroupChat = social?.createGroupChat ?? null;
export const markConversationRead = social?.markConversationRead ?? null;
export const uploadAttachment = social?.uploadAttachment ?? null;
export const attachmentUrl = social?.attachmentUrl ?? null;
export const downloadAttachment = social?.downloadAttachment ?? null;

export const posts = social?.posts ?? null;
export const createPost = social?.createPost ?? null;
export const deletePost = social?.deletePost ?? null;
export const togglePostLike = social?.togglePostLike ?? null;
export const addPostComment = social?.addPostComment ?? null;

export const documents = social?.documents ?? null;
export const uploadDocument = social?.uploadDocument ?? null;
export const downloadDocument = social?.downloadDocument ?? null;
export const toggleDocumentLike = social?.toggleDocumentLike ?? null;
export const deleteDocument = social?.deleteDocument ?? null;

/**
 * The notice centre.
 *
 * Notifications are generated by the server as real events happen, so there is
 * nothing to fall back to locally — a local inbox could only ever show seed
 * rows that no action in the app produced.
 */
export const notifications = social?.notifications ?? null;
export const unreadNotificationCount = social?.unreadNotificationCount ?? null;
export const markNotificationRead = social?.markNotificationRead ?? null;
export const markAllNotificationsRead = social?.markAllNotificationsRead ?? null;
export const deleteNotification = social?.deleteNotification ?? null;

/**
 * The error type callers should catch, whichever transport is active.
 *
 * Not named `Error`: that would shadow the global binding for the whole module,
 * so every `new Error(...)` or `instanceof Error` above the declaration would
 * hit the temporal dead zone and throw at load time.
 */
export const ApiError = MODE === 'proxy' ? proxy.ProxyApiError : UtcApiError;

export const isLive = true;
export { BASE_URL, MODE };