/**
 * Application entry point
 *
 * Boot order:
 *   1. apply the persisted theme before the shell paints
 *   2. mount the persistent layers (animated backdrop, toast host)
 *   3. restore the session
 *   4. register routes with an auth guard
 *   5. start the hash router
 *
 * The router swaps ONE element — `#view` inside the shell — so navigating
 * never reloads the page and the ambient animation keeps running.
 */

// NOTE: stylesheets are linked from index.html (styles/styles.css). Browsers
// do not allow importing CSS from a module script without a bundler, so the
// stylesheet manifest is deliberately kept as a <link>.

import { el, $ } from './utils/dom.js';
import { enhance } from './utils/motion.js';
import { createRouter } from './core/router.js';
import {
  authStore,
  uiStore,
  bootSession,
  applyTheme,
  toggleTheme,
  toggleSidebar,
  applyIncomingNotification,
  applyNotificationsRead,
} from './core/app-store.js';
import * as realtime from './api/realtime-client.js';
import { initPreferences } from './core/preferences.js';
import { createBackdrop } from './components/topbar.js';
import { createAppShell, mountToastHost } from './components/app-shell.js';
import { createCommandPalette } from './components/command-palette.js';
import { renderLogin } from './pages/login.js';

import { dashboardPage } from './pages/dashboard.js';
import { newsPage, newsDetailPage } from './pages/news.js';
import { schedulePage } from './pages/schedule.js';
import { gradesPage } from './pages/grades.js';
import { documentsPage } from './pages/documents.js';
import { postsPage } from './pages/posts.js';
import { friendsPage } from './pages/friends.js';
import { chatPage } from './pages/chat.js';
import { profilePage } from './pages/profile.js';
import { notificationsPage } from './pages/notifications.js';
import { settingsPage } from './pages/settings.js';

/* -------------------------------------------------------------------------- */
/* 1. Theme + preferences                                                      */
/* -------------------------------------------------------------------------- */

applyTheme(uiStore.getState().theme);
uiStore.subscribe((state, prev) => {
  if (state.theme !== prev.theme) applyTheme(state.theme);
});

// Appearance/density/effects preferences live on <html> as data attributes.
initPreferences();

/* -------------------------------------------------------------------------- */
/* 2. Persistent layers                                                        */
/* -------------------------------------------------------------------------- */

document.body.appendChild(createBackdrop());
document.body.appendChild(mountToastHost());

/* -------------------------------------------------------------------------- */
/* 3. Shell                                                                    */
/* -------------------------------------------------------------------------- */

const root = $('#root');
let shell = null;

/** Create the post-login shell once and keep it for the whole session. */
function ensureShell() {
  if (shell) return shell;

  shell = createAppShell(root, { onOpenPalette: (query) => palette?.open(query) });
  root.replaceChildren(shell.node);
  document.body.dataset.screen = 'app';

  // The shell owns its own backdrop-free layout; the login screen does not
  return shell;
}

/** Tear the shell down when the user signs out. */
function dropShell() {
  shell?.topbar?.destroy?.();
  shell = null;
  root.replaceChildren();
  document.body.dataset.screen = 'auth';
}

function outlet() {
  return shell ? $('#view', shell.node) : null;
}

/* -------------------------------------------------------------------------- */
/* 4. Routes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Wrap a page renderer: ensure the shell exists, hand the renderer the live
 * `#view` node, then run the motion enhancements over the result.
 *
 * The renderer may return a teardown function. It is forwarded to the router,
 * which calls it before the next navigation; dropping it leaks that page's
 * realtime subscriptions and timers into whatever page comes next.
 *
 * `fill` marks routes that size themselves against the viewport. The shell
 * then stops scrolling so the page does not grow a second scrollbar.
 */
function page(render, { fill = false } = {}) {
  return async (ctx) => {
    ensureShell();

    const target = outlet();
    if (!target) return null;

    const content = target.closest('.app__content');
    content?.classList.toggle('is-fill', fill);

    const cleanup = await render({ ...ctx, outlet: target });
    enhance(target);

    // No class cleanup here: a stale render may be discarded after a newer
    // page already mounted, and removing `is-fill` then would strip it from
    // the live page. Every mount sets the flag explicitly instead.
    return typeof cleanup === 'function' ? cleanup : null;
  };
}

/** Standalone login screen — deliberately has no sidebar or topbar. */
function loginScreen(ctx) {
  dropShell();
  renderLogin(root);
  enhance(root);
  return null;
}

/** 404 */
function notFound(ctx) {
  ensureShell();
  const target = outlet();
  if (!target) return null;

  target.replaceChildren(
    el('div.empty-state', { style: { minHeight: '58vh' } }, [
      el('div.empty-state__icon', { style: { width: '5rem', height: '5rem' } }, '404'),
      el('div.stack-2', {}, [
        el('h2.section-title', { style: { fontSize: 'var(--text-xl)' } }, 'Không tìm thấy trang'),
        el('p.body-text', { style: { maxWidth: '30rem' } },
          'Đường dẫn bạn truy cập không tồn tại hoặc đã được chuyển đi nơi khác.'),
      ]),
      el('a.btn.btn--primary', { href: '#/' }, 'Về trang tổng quan'),
    ])
  );

  return null;
}

const ROUTES = [
  { path: '/login', view: loginScreen, title: 'Đăng nhập' },
  { path: '/', view: page(dashboardPage), title: 'Tổng quan', auth: true },
  { path: '/news', view: page(newsPage), title: 'Tin tức', auth: true },
  { path: '/news/:id', view: page(newsDetailPage), title: 'Bài viết', auth: true },
  { path: '/schedule', view: page(schedulePage), title: 'Thời khóa biểu', auth: true },
  { path: '/grades', view: page(gradesPage), title: 'Kết quả học tập', auth: true },
  { path: '/documents', view: page(documentsPage), title: 'Tài liệu', auth: true },
  { path: '/posts', view: page(postsPage), title: 'Bài đăng', auth: true },
  { path: '/friends', view: page(friendsPage), title: 'Tìm bạn bè', auth: true },
  { path: '/chat', view: page(chatPage, { fill: true }), title: 'Tin nhắn', auth: true },
  { path: '/profile', view: page(profilePage), title: 'Hồ sơ', auth: true },
  { path: '/notifications', view: page(notificationsPage), title: 'Thông báo', auth: true },
  { path: '/settings', view: page(settingsPage), title: 'Cài đặt', auth: true },
  { path: '*', view: notFound, title: 'Không tìm thấy' },
];

/**
 * Route guard.
 * - Protected routes bounce anonymous visitors to /login (preserving `next`).
 * - Signed-in visitors never see the login screen.
 */
function guard({ route, pathname }) {
  const { status } = authStore.getState();

  if (status === 'booting') return '/';

  if (route.auth && status !== 'authenticated') {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  if (route.path === '/login' && status === 'authenticated') {
    return '/';
  }

  return pathname;
}

/* -------------------------------------------------------------------------- */
/* 5. Auth transitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Push notifications, for the whole session.
 *
 * Registered here rather than on the notifications page so the bell reacts
 * wherever the student is. The handler is deliberately dumb — bump the count
 * and show a toast — because anything smarter needs to know which page is
 * mounted, and that is the page's job to subscribe to.
 *
 * Tied to the auth state: a notice that arrives after signing out must not be
 * applied to whoever signs in next.
 */
let stopNotificationFeed = null;
let stopNotificationReadFeed = null;

function startNotificationFeed() {
  stopNotificationFeed?.();
  stopNotificationFeed = realtime.on(realtime.REALTIME_EVENTS.NOTIFICATION, (notice) => {
    if (authStore.getState().status !== 'authenticated') return;
    applyIncomingNotification(notice);
  });

  // The server clears a conversation's notices when the thread is read; the
  // bell must follow that without waiting for the next page load.
  stopNotificationReadFeed?.();
  stopNotificationReadFeed = realtime.on(
    realtime.REALTIME_EVENTS.NOTIFICATION_READ,
    ({ ids } = {}) => {
      if (authStore.getState().status !== 'authenticated') return;
      applyNotificationsRead(ids ?? []);
    }
  );
}

function endNotificationFeed() {
  stopNotificationFeed?.();
  stopNotificationFeed = null;
  stopNotificationReadFeed?.();
  stopNotificationReadFeed = null;
}

authStore.subscribe((state, prev) => {
  if (state.status === prev.status) return;

  if (state.status === 'authenticated') {
    startNotificationFeed();
    ensureShell();
    // Re-resolve so the guard lets the current URL through
    requestAnimationFrame(() => router?.resolve());
  }

  if (state.status === 'anonymous') {
    endNotificationFeed();
    dropShell();
    const hash = window.location.hash.replace(/^#/, '') || '/';
    if (hash !== '/login') window.location.hash = '/login';
    else router?.resolve();
  }
});

/* -------------------------------------------------------------------------- */
/* 6. Boot                                                                     */
/* -------------------------------------------------------------------------- */

let router = null;

/** Global command palette, opened with Ctrl/Cmd+K. */
const palette = createCommandPalette({
  navigate: (to) => {
    if (!to) return;
    // Full page loads go through the router so the shell is not torn down.
    if (to.startsWith('/')) window.location.hash = to;
  },
});

/**
 * Global keyboard shortcuts.
 *
 * Every handler bails out while the user is typing, otherwise Ctrl+B inside a
 * textarea would collapse the sidebar instead of inserting a character.
 */
function bindShortcuts() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      palette.open();
      return;
    }

    // Bare shortcuts stay out of the way while typing.
    if (typing || event.altKey) return;

    if (mod && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      if (window.innerWidth > 1024) toggleSidebar();
      return;
    }

    if (mod && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      toggleTheme();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      window.location.hash = '/settings';
    }
  });
}

async function boot() {
  await bootSession();

  router = createRouter({ routes: ROUTES, outlet: root, guard });
  router.start();

  bindShortcuts();

  document.body.classList.add('is-ready');
}

boot().catch((error) => {
  console.error('[utc-student] boot failed:', error);
  root.replaceChildren(
    el('div.empty-state', { style: { minHeight: '100dvh' } }, [
      el('div.empty-state__icon', {}, '!'),
      el('h2.section-title', {}, 'Ứng dụng không khởi động được'),
      el('p.body-text', { style: { maxWidth: '32rem' } }, error.message),
      el(
        'button.btn.btn--primary',
        { type: 'button', onclick: () => window.location.reload() },
        'Tải lại trang'
      ),
    ])
  );
});