/**
 * Application shell
 * Assembles sidebar + topbar + routed outlet, and owns the boot sequence.
 */

import { el, $ } from '../utils/dom.js';
import { createSidebar, NAV_ITEMS } from './sidebar.js';
import { createTopbar, createBackdrop } from './topbar.js';
import { mountToastHost } from './toast.js';
import { openMenu } from './menu.js';
import { button } from './ui.js';
import { uiStore, authStore, signOut } from '../core/app-store.js';
import { attachRipple } from '../utils/motion.js';

/**
 * Build the post-login shell.
 * @param {HTMLElement} outlet - Router target for page content.
 * @param {{onOpenPalette?: (query?: string) => void}} [options]
 * @returns {{node: HTMLElement}}
 */
export function createAppShell(outlet, { onOpenPalette = null } = {}) {
  const app = el('div.app', { id: 'app' });

  /* ---------- Sidebar ---------- */
  const sidebar = createSidebar({
    onNavigate: () => {
      closeRouteWipe();
    },
    onUserClick: (event) => openAccountMenu(event.currentTarget),
  });

  /* ---------- Topbar ---------- */
  const topbar = createTopbar({
    onSearch: (query, options) => {
      if (!query) return;
      // Hand off to the command palette: it searches documents, posts, news,
      // courses and people at once, so a typed query should not be funnelled
      // into one library.
      if (onOpenPalette) {
        onOpenPalette(query);
        return;
      }
      const target = `${window.location.hash.includes('documents') ? '' : '/documents'}?q=${encodeURIComponent(query)}`;
      if (options?.submit) window.location.hash = target.startsWith('/') ? target : `/${target}`;
    },
  });

  /* ---------- Main column ---------- */
  const content = el('div.app__content', {}, [
    el('div.app__inner', {}, el('div#view', { id: 'view', role: 'main' })),
  ]);

  const main = el('main.app__main', {}, [topbar.node, content]);
  app.append(sidebar.node, main);

  /* ---------- Route transition indicator ----------
     This used to be a full-viewport gradient wiping across the screen. That
     meant a viewport-sized layer composited over the entire app for 620ms on
     every navigation — measured at ~9% of total route-switch cost for a piece
     of pure decoration.

     It is now a 3px progress line pinned under the topbar: same "something is
     happening" signal, a few hundred pixels of paint instead of a full screen. */
const wipe = el('div.route-wipe', { 'aria-hidden': 'true' });
document.body.appendChild(wipe);

function playRouteWipe() {
    wipe.classList.remove('is-active');
    void wipe.offsetWidth;
    wipe.classList.add('is-active');
}

function closeRouteWipe() {
    wipe.classList.remove('is-active');
  }

  /* ---------- Account menu ---------- */
  function openAccountMenu(anchor) {
    const user = authStore.getState().user;
    openMenu({
      anchor,
      align: 'start',
      minWidth: '17rem',
      header: el('div.user-menu__head', {}, [
        el('div.stack-1', { style: { minWidth: 0 } }, [
          el('strong', { style: { fontSize: 'var(--text-sm)' } }, user?.fullName ?? ''),
          el('span.user-menu__id', {}, user?.studentId ?? ''),
          el('span.caption', {}, user?.className ?? ''),
        ]),
      ]),
      items: [
        { label: 'Hồ sơ cá nhân', iconName: 'user', onSelect: () => (window.location.hash = '/profile') },
        { label: 'Thời khóa biểu', iconName: 'calendar', onSelect: () => (window.location.hash = '/schedule') },
        {
          label: 'Giao diện',
          iconName: uiStore.getState().theme === 'dark' ? 'sun' : 'moon',
          onSelect: async () => {
            const { toggleTheme } = await import('../core/app-store.js');
            toggleTheme();
          },
        },
        { type: 'separator' },
        {
          label: 'Đăng xuất',
          iconName: 'logout',
          danger: true,
          onSelect: async () => {
            await signOut();
            window.location.hash = '/login';
          },
        },
      ],
    });
  }

  /* ---------- Reactive layout ---------- */
  uiStore.subscribe((state, prev) => {
    app.classList.toggle('is-collapsed', state.sidebarCollapsed);
    app.classList.toggle('is-mobile-nav-open', state.mobileNavOpen);

    if (state.mobileNavOpen !== prev.mobileNavOpen) {
      document.body.style.overflow = state.mobileNavOpen ? 'hidden' : '';
      if (!state.mobileNavOpen) {
        document.querySelector('.sidebar__backdrop')?.remove();
      }
    }
  });

  app.classList.toggle('is-collapsed', uiStore.getState().sidebarCollapsed);

  /* ---------- Global interactions ---------- */
  attachRipple(document.body);

  document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + K focuses global search
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      topbar.focusSearch();
    }
    // Escape closes the mobile drawer
    if (event.key === 'Escape' && uiStore.getState().mobileNavOpen) {
      uiStore.setState({ mobileNavOpen: false });
    }
  });

  // Play the wipe when the route changes without a full re-render
  window.addEventListener('hashchange', playRouteWipe);

  return { node: app, topbar, sidebar, playRouteWipe };
}

export { mountToastHost, NAV_ITEMS };