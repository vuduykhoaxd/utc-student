/**
 * Application state
 *
 * Two stores:
 *  - `authStore`  : signed-in user, boot status.
 *  - `uiStore`    : theme, sidebar, notifications popover, toasts.
 */

import { createStore } from './store.js';
import { auth, notificationsApi, users as usersApi, chatApi } from './api.js';
import { readRaw, writeRaw } from '../utils/storage.js';
import * as realtime from '../api/realtime-client.js';

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const authStore = createStore({
  /** 'booting' | 'anonymous' | 'authenticated' */
  status: 'booting',
  user: null,
  error: null,
  submitting: false,
});

/** Restore a session on boot. */
export async function bootSession() {
  authStore.setState({ status: 'booting' });

  /**
   * Start the socket regardless of what the session check returns.
   *
   * The connection retries on its own, so kicking it here is what lets the app
   * recover on its own when the backend was still starting up. Gating it on a
   * successful sign-in left the client permanently one-way after an outage.
   */
  realtime.connect().catch((error) => console.warn('[realtime] chưa kết nối được:', error.message));

  try {
    const user = await auth.session();

    if (user?.identity) {
      // Refresh the cached profile; the backend record was written at login.
      await usersApi.ensureLiveStudent(user.identity);
    }

    authStore.setState({
      status: user ? 'authenticated' : 'anonymous',
      user,
    });

    if (user) refreshUnread();

    return user;
  } catch (error) {
    /**
     * Only a rejected session means "signed out".
     *
     * A network failure while checking would otherwise eject a signed-in
     * student to the login screen for a few seconds of backend downtime, and
     * lose whatever they had typed.
     */
    const expired = error?.status === 401 || error?.code === 'UNAUTHENTICATED';
    const cached = expired ? null : cachedUser();

    authStore.setState({
      status: cached ? 'authenticated' : 'anonymous',
      user: cached,
      error: expired ? error.message : null,
    });

    if (!expired && cached) {
      console.warn('[auth] không kiểm tra được phiên, dùng bản ghi cục bộ:', error.message);
    }

    return cached;
  }
}

/**
 * The identity already in localStorage.
 *
 * Used when the backend cannot be reached: the profile on screen is a few
 * minutes old at worst, which beats showing a login form to a user who never
 * signed out.
 */
function cachedUser() {
  try {
    const session = JSON.parse(localStorage.getItem('utc:session') ?? 'null');
    if (!session?.identity) return null;
    return { token: session.token, identity: session.identity };
  } catch {
    return null;
  }
}

/** Sign in. Returns the user, or null with `error` set on the store. */
export async function signIn(credentials) {
  authStore.setState({ submitting: true, error: null });
  try {
    const user = await auth.login(credentials);
    if (user?.identity) {
      await usersApi.ensureLiveStudent(user.identity);
    }
    authStore.setState({ submitting: false, status: 'authenticated', user });

    // Connect after the token is stored — the socket authenticates from it.
    realtime.connect().catch((error) => console.warn('[realtime] không kết nối được:', error.message));
    refreshUnread();

    return user;
  } catch (error) {
    authStore.setState({ submitting: false, error: error.message });
    return null;
  }
}

/** Sign out and return to the anonymous state. */
export async function signOut() {
  // Drop the socket first: leaving it connected would keep delivering the
  // previous student's events to whoever signs in next on this browser.
  await realtime.disconnect();
  await auth.logout();
  authStore.setState({ status: 'anonymous', user: null, error: null });
}

/** The signed-in student's id, or null. */
export const currentUserId = () => {
  const user = authStore.getState().user;
  return user?.id ?? user?.identity?.id ?? user?.identity?.studentId ?? null;
};

/* -------------------------------------------------------------------------- */
/* UI                                                                         */
/* -------------------------------------------------------------------------- */

const THEME_KEY = 'theme';

/** Read the persisted theme, defaulting to dark. */
function initialTheme() {
  const saved = readRaw(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const uiStore = createStore({
  theme: initialTheme(),
  sidebarCollapsed: readRaw('sidebar') === 'collapsed',
  mobileNavOpen: false,
  globalSearch: '',
  notificationsOpen: false,
  userMenuOpen: false,
  unreadNotifications: 0,
  unreadMessages: 0,
  // Conversation currently on screen, so a live notice for it can be swallowed
  // instead of popping a toast for a message already being read.
  activeConversationId: null,
  toasts: [],
});

/** Apply the theme to the document element. */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#0d1018');
  writeRaw(THEME_KEY, theme);
}

/** Toggle between light and dark. */
export function toggleTheme() {
  const next = uiStore.getState().theme === 'dark' ? 'light' : 'dark';
  uiStore.setState({ theme: next });
  applyTheme(next);
  toast({
    title: next === 'dark' ? 'Chế độ tối' : 'Chế độ sáng',
    message: 'Giao diện đã được cập nhật.',
    variant: 'info',
  });
}

export function toggleSidebar() {
  const collapsed = !uiStore.getState().sidebarCollapsed;
  uiStore.setState({ sidebarCollapsed: collapsed });
  writeRaw('sidebar', collapsed ? 'collapsed' : 'expanded');
}

export function setMobileNav(open) {
  uiStore.setState({ mobileNavOpen: open });
}

/** Close every floating surface. */
export function closeOverlays() {
  uiStore.setState({ notificationsOpen: false, userMenuOpen: false });
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

let toastId = 0;

/**
 * Push a toast.
 * @param {{title: string, message?: string, variant?: 'info'|'success'|'error'|'warn', duration?: number}} options
 */
export function toast({ title, message = '', variant = 'info', duration = 4000 }) {
  toastId += 1;
  const id = `toast_${toastId}`;

  uiStore.setState((state) => ({
    toasts: [...state.toasts, { id, title, message, variant, duration }],
  }));

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

/** Remove a toast. */
export function dismissToast(id) {
  uiStore.setState((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  }));
}

/* -------------------------------------------------------------------------- */
/* Unread counters                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Refresh the notification and message counters.
 *
 * Both are counted by the backend rather than guessed here: the number on the
 * bell has to survive a reload and agree across tabs, which a local tally
 * cannot do once two devices are signed in as the same student.
 */
export async function refreshUnread() {
  if (authStore.getState().status !== 'authenticated') return;

  try {
    const [unreadNotifications, unreadMessages] = await Promise.all([
      notificationsApi.unreadCount(),
      countUnreadMessages(),
    ]);
    uiStore.setState({ unreadNotifications, unreadMessages });
  } catch {
    /* non-critical: the badges keep their last known value */
  }
}

/**
 * Total unread across the caller's conversations.
 *
 * Summed from the server's own per-conversation counts, which is what the chat
 * list already renders — so the sidebar badge and the list cannot disagree.
 */
async function countUnreadMessages() {
  try {
    const rows = await chatApi.list();
    return rows.reduce((sum, conversation) => sum + (conversation.unread ?? 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Apply a notice that just arrived over the socket.
 *
 * Called instead of re-counting so the bell reacts the instant something
 * happens, rather than on the next page load. `sounds` is a hint for the toast:
 * a chat notice is worth interrupting for, a "post liked" notice is not.
 */
/**
 * Notices suppressed because their thread was already open.
 *
 * They were never added to the bell, so the matching "read" event must not
 * subtract them again.
 */
const uncountedNotices = new Set();

export function applyIncomingNotification(notice) {
  if (!notice) return;

  /**
   * A notice for the thread that is already open is noise: the message is on
   * screen, and it was just marked read on the server. Swallow it entirely so
   * the bell, the message badge and the toast all stay quiet.
   */
  const openConversation =
    notice.conversationId && uiStore.getState().activeConversationId === notice.conversationId;

  if (openConversation) {
    if (notice.id) uncountedNotices.add(notice.id);
    return;
  }

  uiStore.setState((state) => ({
    unreadNotifications: notice.read ? state.unreadNotifications : state.unreadNotifications + 1,
  }));

  const noisy = notice.category === 'chat' || notice.category === 'friend';

  toast({
    title: noisy ? notice.title : 'Có thông báo mới',
    message: noisy ? notice.message : notice.title,
    variant: noisy ? 'info' : 'default',
  });

  // The message badge follows the same event.
  if (notice.category === 'chat') {
    uiStore.setState((state) => ({ unreadMessages: state.unreadMessages + 1 }));
  }
}

/** Apply a server-side "these notices are read now" event to the bell. */
export function applyNotificationsRead(ids = []) {
  let delta = 0;

  for (const id of Array.isArray(ids) ? ids : []) {
    if (uncountedNotices.delete(id)) continue;
    delta += 1;
  }

  if (delta <= 0) return;
  uiStore.setState((state) => ({
    unreadNotifications: Math.max(0, state.unreadNotifications - delta),
  }));
}

/** Subscribe to store changes (used by main.js). */
export { authStore as auth, uiStore as ui };