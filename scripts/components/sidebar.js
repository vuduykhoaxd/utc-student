/**
 * Sidebar
 * Brand lockup, primary navigation, account footer.
 * Reads its own state from the UI and auth stores.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';
import { avatar } from './ui.js';
import { uiStore, authStore, toggleSidebar, setMobileNav, closeOverlays } from '../core/app-store.js';
import { ROUTE_EVENT } from '../core/router.js';
import { formatCompact } from '../utils/format.js';

/**
 * Navigation model. `count` keys are resolved against the stores at render
 * time, so badges stay live without the nav module knowing about features.
 */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan', route: '/', iconName: 'dashboard', group: 'Chính' },
  { id: 'news', label: 'Tin tức & Thông báo', route: '/news', iconName: 'news', group: 'Học tập', count: 'unreadNews' },
  { id: 'schedule', label: 'Thời khóa biểu', route: '/schedule', iconName: 'calendar', group: 'Học tập' },
  { id: 'grades', label: 'Kết quả học tập', route: '/grades', iconName: 'award', group: 'Học tập' },
  { id: 'documents', label: 'Tài liệu', route: '/documents', iconName: 'folder', group: 'Học tập' },
  { id: 'posts', label: 'Bài đăng', route: '/posts', iconName: 'messages', group: 'Cộng đồng' },
  { id: 'friends', label: 'Tìm bạn bè', route: '/friends', iconName: 'users', group: 'Cộng đồng' },
  { id: 'chat', label: 'Tin nhắn', route: '/chat', iconName: 'fileText', group: 'Cộng đồng', count: 'unreadMessages' },
  { id: 'profile', label: 'Hồ sơ', route: '/profile', iconName: 'user', group: 'Cá nhân' },
  { id: 'notifications', label: 'Thông báo', route: '/notifications', iconName: 'bell', group: 'Cá nhân', count: 'unreadNotifications' },
  { id: 'settings', label: 'Cài đặt', route: '/settings', iconName: 'settings', group: 'Cá nhân' },
];

const GROUP_ORDER = ['Chính', 'Học tập', 'Cộng đồng', 'Cá nhân'];

/** Resolve badge counts from the live stores. */
function counts() {
  const auth = authStore.getState();
  const ui = uiStore.getState();

  const unreadNews = auth.user?.newsUnread ?? 0;
  return {
    unreadNews,
    unreadMessages: ui.unreadMessages,
    unreadNotifications: ui.unreadNotifications,
  };
}

/**
 * Build the sidebar.
 * @param {{onNavigate?: Function, onUserClick?: Function}} options
 */
export function createSidebar({ onNavigate, onUserClick } = {}) {
  const listNav = el('nav.sidebar__nav', { 'aria-label': 'Điều hướng chính' });
  const liveCounts = counts();

  /** Route -> active check. `/` only matches exactly. */
  const isActive = (route) => {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    if (route === '/') return hash === '/';
    return hash === route || hash.startsWith(`${route}/`);
  };

  const itemNodes = [];

  GROUP_ORDER.forEach((group) => {
    const items = NAV_ITEMS.filter((item) => item.group === group);
    if (!items.length) return;

    const groupNode = el('div.sidebar__group', {}, [
      el('p.sidebar__group-label', {}, group),
    ]);

    items.forEach((item) => {
      const badgeNode = el('span.nav-item__count', { hidden: true });
      const countValue = liveCounts[item.count] ?? 0;

      if (countValue > 0) {
        badgeNode.hidden = false;
        badgeNode.textContent = formatCompact(countValue);
        badgeNode.classList.toggle('nav-item__count--live', item.count !== 'unreadNews');
      }

      const node = el(
        'a.nav-item',
        {
          href: `#${item.route}`,
          'data-nav': item.id,
          'data-label': item.label,
          'aria-label': item.label,
          onclick: () => {
            setMobileNav(false);
            closeOverlays();
            onNavigate?.(item);
          },
        },
        [
          el('span.nav-item__icon', {}, icon(item.iconName)),
          el('span.nav-item__label', {}, item.label),
          badgeNode,
        ]
      );

      itemNodes.push({ item, node, badgeNode });
      groupNode.appendChild(node);
    });

    listNav.appendChild(groupNode);
  });

  /* ---------- Account footer ---------- */
  const user = authStore.getState().user;

  const userCard = el(
    'button.user-card',
    {
      type: 'button',
      'aria-label': 'Tài khoản của bạn',
      onclick: () => onUserClick?.(),
    },
    [
      avatar({ user, size: 'sm', presence: true }),
      el('div.user-card__info', {}, [
        el('span.user-card__name', {}, user?.fullName ?? 'Khách'),
        el('span.user-card__meta', {}, user?.studentId ?? '—'),
      ]),
      el('span.user-card__chevron', {}, icon('chevronRight')),
    ]
  );

  /* ---------- Collapse control ---------- */
  const collapse = el(
    'button.sidebar__collapse',
    {
      type: 'button',
      'aria-label': 'Thu gọn / mở rộng thanh điều hướng',
      title: 'Thu gọn / mở rộng',
      onclick: toggleSidebar,
    },
    icon('chevronLeft')
  );

  /* ---------- Backdrop for mobile drawer ---------- */
  const backdrop = el('div.sidebar__backdrop', {
    hidden: true,
    onclick: () => setMobileNav(false),
  });

  const node = el('aside.sidebar', { 'aria-label': 'Thanh điều hướng' }, [
    el('a.sidebar__brand', { href: '#/' }, [
      el('span.sidebar__logo', {}, icon('graduation')),
      el('div.sidebar__wordmark', {}, [
        el('span.sidebar__name', {}, [el('em', {}, 'UTC'), ' Student']),
        el('span.sidebar__tagline', {}, 'ĐH GTVT & Truyền thông'),
      ]),
    ]),
    listNav,
    el('footer.sidebar__footer', {}, [userCard]),
    collapse,
  ]);

  /* ---------- Reactive behaviour ---------- */

  const syncActive = () => {
    itemNodes.forEach(({ item, node: itemNode }) => {
      itemNode.classList.toggle('is-active', isActive(item.route));
    });
  };

  const syncCounts = () => {
    const next = counts();
    itemNodes.forEach(({ item, badgeNode }) => {
      const value = next[item.count] ?? 0;
      badgeNode.hidden = value === 0;
      badgeNode.textContent = formatCompact(value);
      badgeNode.classList.toggle('nav-item__count--live', item.count !== 'unreadNews');
    });
  };

  const syncMobile = (state) => {
    const open = state.mobileNavOpen;
    backdrop.hidden = !open;
    if (open) document.body.appendChild(backdrop);
    else backdrop.remove();
  };

  syncActive();
  syncCounts();

  uiStore.subscribe((state, prev) => {
    syncActive();
    syncCounts();
    if (state.mobileNavOpen !== prev.mobileNavOpen) syncMobile(state);
  });

  // The router announces every resolved route; re-sync the active item and the
  // badge counts so persistent chrome never drifts from the current URL.
  window.addEventListener(ROUTE_EVENT, () => {
    syncActive();
    syncCounts();
  });

  setInterval(syncCounts, 15_000);

  return { node, syncActive, syncCounts };
}