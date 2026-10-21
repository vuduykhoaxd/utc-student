/**
 * API configuration
 * ---------------------------------------------------------------------------
 * Point the app at the hosted UTC backend.
 *
 * Two transport modes, because the portal has one unavoidable constraint:
 *
 *   MODE = 'direct'  -> the browser talks to qldt.utc.edu.vn itself.
 *                       Everything works EXCEPT the session cookie: the portal
 *                       answers with `Access-Control-Allow-Origin: *`, and a
 *                       wildcard origin forbids credentialed requests, so the
 *                       browser refuses to store the `.Auth` cookie the login
 *                       POST sets. See docs/utc-protocol.md.
 *
 *   MODE = 'proxy'   -> a same-origin shim holds the cookie and forwards the
 *                       call. Required for sign-in from a browser.
 *
 * Verified against the live portal while building this:
 *   GET  /congthongtin/login.aspx        -> 200, ACAO: *
 *   POST /congthongtin/login.aspx        -> 302, sets two .Auth cookies
 *   GET  /congthongtin/Index.aspx        -> embeds AXYZCLRVN() = tokenJWT
 *   POST /sinhvienapi/api/... (no Bearer)-> 401
 *   GET  /congthongtin/Pages/ChangePass.aspx -> the password form
 */

/**
 * Which transport to use: 'direct' | 'proxy'
 *
 * 'proxy' routes every call through the Node backend, which keeps the portal's
 * `.Auth` cookie server-side. This is the only mode that can sign in from a
 * static host such as GitHub Pages, so it is the default.
 *
 * Point BASE_URL at the deployed backend before going live. For local work the
 * backend runs on https://utc-student.falix.org/
 */
export const MODE = 'proxy';

/**
 * In 'proxy' mode this is the Node backend. In 'direct' mode it is the portal.
 *
 * `localhost` is reachable from a GitHub Pages build but is NOT reachable from
 * anyone else's machine, so it only works while developing locally.
 */
export const BASE_URL =
  MODE === 'direct'
    ? 'https://qldt.utc.edu.vn'
    : (window.UTC_API_BASE_URL || 'https://utc-student.falix.org');

/** Portal paths, in one place so they are easy to audit. */
export const PATHS = {
  login: '/congthongtin/login.aspx',
  index: '/congthongtin/Index.aspx',
  changePassword: '/congthongtin/Pages/ChangePass.aspx',
  api: '/sinhvienapi/api',
};

/** Referer the student API expects. */
export const REFERER = `${BASE_URL}${PATHS.index}`;

/**
 * Whether the fetch should ask for cookies.
 *
 * In 'direct' mode this is deliberately FALSE: the portal sends a wildcard
 * ACAO, and requesting credentials against a wildcard makes the browser reject
 * the whole response. Turning it on would turn a clear error into a confusing
 * one. Switch to 'proxy' to get it back.
 */
export const USE_CREDENTIALS = MODE === 'proxy';

/** How long a signed-in session survives a reload (ms). */
export const SESSION_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

/** Network timeout for a single request (ms). */
export const REQUEST_TIMEOUT = 30_000;

/** Turn the real backend on/off without touching the code below. */
export const USE_LIVE_API = true;
