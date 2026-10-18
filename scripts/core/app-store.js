/**
 * Application state
 *
 * Two stores:
 *  - `authStore`  : signed-in user, boot status.
 *  - `uiStore`    : theme, sidebar, notifications popover, toasts.
 */

import { createStore } from './store.js';
import { auth, notificationsApi } from './api.js';
import { readRaw, writeRaw } from '../utils/storage.js';

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
  const user = await auth.session();
  authStore.setState({
    status: user ? 'authenticated' : 'anonymous',
    user,
  });
  if (user) refreshUnread();
  return user;
}

/** Sign in. Returns the user, or null with `error` set on the store. */
export async function signIn(credentials) {
  authStore.setState({ submitting: true, error: null });
  try {
    const user = await auth.login(credentials);
    authStore.setState({ submitting: false, status: 'authenticated', user });
    refreshUnread();
    return user;
  } catch (error) {
    authStore.setState({ submitting: false, error: error.message });
    return null;
  }
}

/** Sign out and return to the anonymous state. */
export async function signOut() {
  await auth.logout();
  authStore.setState({ status: 'anonymous', user: null, error: null });
}

/** The signed-in student's id, or null. */
export const currentUserId = () => authStore.getState().user?.id ?? null;

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

/** Refresh the notification and message counters. */
export async function refreshUnread() {
  if (authStore.getState().status !== 'authenticated') return;
  try {
    const unreadNotifications = await notificationsApi.unreadCount();
    uiStore.setState({ unreadNotifications });
  } catch {
    /* non-critical */
  }
}

/** Subscribe to store changes (used by main.js). */
export { authStore as auth, uiStore as ui };