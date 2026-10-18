/**
 * Topbar
 * Mobile nav trigger, page context, global search, notifications popover,
 * theme toggle, account menu, live clock.
 */

import { el, $, render } from '../utils/dom.js';
import { icon } from './icons.js';
import { avatar, button, quickActionBadged, badge } from './ui.js';
import { openMenu, openPopover } from './menu.js';
import {
  uiStore,
  authStore,
  toggleTheme,
  setMobileNav,
  toggleSidebar,
  toast,
} from '../core/app-store.js';
import { notificationsApi } from '../core/api.js';
import { formatDate, formatTime } from '../utils/format.js';
import { NAV_ITEMS } from './sidebar.js';
import { ROUTE_EVENT } from '../core/router.js';

const NOTIF_ICON = {
  news: 'news',
  grade: 'award',
  chat: 'messages',
  friend: 'users',
  doc: 'fileText',
  alert: 'alert',
};

const NOTIF_TONE = {
  news: 'var(--primary-soft)',
  grade: 'var(--success-soft)',
  chat: 'var(--accent-soft)',
  friend: 'var(--violet-soft)',
  doc: 'var(--signal-soft)',
  alert: 'var(--danger-soft)',
};

/**
 * Build the topbar.
 * @param {{onSearch?: (query: string) => void}} options
 */
export function createTopbar({ onSearch } = {}) {
  const user = authStore.getState().user;

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = el(
    'button.quick-action.topbar__nav-toggle',
    {
      type: 'button',
      'aria-label': 'Mở menu điều hướng',
      onclick: () => setMobileNav(true),
    },
    icon('menu')
  );

  /* ---------- Page context ---------- */
  const titleNode = el('span.topbar__title', {}, 'Tổng quan');
  const crumbNode = el('span.topbar__crumb-current', {}, '');

  const context = el('div.topbar__context', {}, [
    el('span.topbar__crumb', {}, [
      el('span', {}, 'UTC Student'),
      icon('chevronRight'),
      crumbNode,
    ]),
    titleNode,
  ]);

  /* ---------- Live clock ---------- */
  const clockTime = el('span.topbar__clock-time', {}, '');
  const clockDate = el('span.topbar__clock-date', {}, '');

  const tickClock = () => {
    const now = new Date();
    clockTime.textContent = formatTime(now);
    clockDate.textContent = formatDate(now, 'medium');
  };
  tickClock();
  const clockTimer = setInterval(tickClock, 15_000);

  const clock = el('div.topbar__clock', {}, [clockTime, clockDate]);

  /* ---------- Global search ---------- */
  const searchInput = el('input', {
    type: 'search',
    name: 'global-search',
    'aria-label': 'Tìm kiếm toàn cục',
    autocomplete: 'off',
    placeholder: 'Tìm tài liệu, bài đăng, môn học…',
  });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onSearch?.(searchInput.value.trim()), 220);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      searchInput.blur();
      onSearch?.('');
    }
    // Enter opens the command palette seeded with whatever was typed, instead of
    // jumping straight to one filtered list.
    if (event.key === 'Enter' && searchInput.value.trim()) {
      event.preventDefault();
      onSearch?.(searchInput.value.trim(), { submit: true });
    }
    if (event.key === 'Enter' && !searchInput.value.trim()) {
      event.preventDefault();
      onSearch?.('', { submit: true });
    }
  });

  // "/" focuses global search from anywhere
  const onGlobalKey = (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  };
  document.addEventListener('keydown', onGlobalKey);

  const search = el('div.topbar__search', {}, [
    el('label.search', { 'aria-label': 'Tìm kiếm toàn cục' }, [
      el('span.search__icon', {}, icon('search')),
      searchInput,
      el('kbd', {}, 'Ctrl K'),
    ]),
  ]);

  /* ---------- Notifications ---------- */
  const bellNode = quickActionBadged({
    iconName: 'bell',
    label: 'Thông báo',
    count: uiStore.getState().unreadNotifications,
    onclick: (event) => openNotifications(event.currentTarget),
  });
  bellNode.classList.add('topbar__bell');

  async function openNotifications(anchor) {
    let items = [];
    try {
      items = await notificationsApi.list();
    } catch {
      toast({ title: 'Không tải được thông báo', variant: 'error' });
      return;
    }

    const header = el('header.notif-popover__head', {}, [
      el('strong', { style: { fontSize: 'var(--text-sm)' } }, 'Thông báo'),
      el(
        'button.btn.btn--ghost.btn--xs',
        {
          type: 'button',
          onclick: async () => {
            await notificationsApi.markAllRead();
            uiStore.setState({ unreadNotifications: 0 });
            refreshBell();
            popover.close();
            toast({ title: 'Đã đánh dấu tất cả là đã đọc', variant: 'success' });
          },
        },
        'Đọc tất cả'
      ),
    ]);

    const body = el(
      'div.notif-popover__body',
      {},
      items.length
        ? items.slice(0, 8).map((item) => notificationRow(item))
        : el('div.empty-state', { style: { padding: 'var(--space-10) 0' } }, [
            el('span.caption', {}, 'Bạn không có thông báo nào.'),
          ])
    );

    const popover = openPopover({ anchor, header, body });

    function notificationRow(item) {
      return el(
        `div.notif.notif--${item.category}`,
        { class: item.read ? '' : 'notif--unread' },
        [
          el('span.notif__icon', { style: { '--notif-tint': NOTIF_TONE[item.category] } }, icon(NOTIF_ICON[item.category] ?? 'info')),
          el('div.notif__body', {}, [
            el('span.notif__title', {}, item.title),
            el('span.notif__msg.clamp-2', {}, item.message),
            el('span.notif__time', {}, item.relativeTime),
          ]),
        ]
      );
    }
  }

  function refreshBell() {
    const count = uiStore.getState().unreadNotifications;
    bellNode.classList.toggle('has-unread', count > 0);

    const existing = bellNode.querySelector('.quick-action__dot');
    if (count > 0) {
      const dot = existing ?? el('span.quick-action__dot');
      dot.textContent = count > 99 ? '99+' : String(count);
      if (!existing) bellNode.appendChild(dot);
    } else {
      existing?.remove();
    }
  }

  /* ---------- Theme toggle ---------- */
  const themeButton = el(
    'button.quick-action.theme-toggle',
    {
      type: 'button',
      'aria-label': 'Đổi giao diện sáng / tối',
      title: 'Đổi giao diện sáng / tối',
      onclick: toggleTheme,
    },
    icon('sun')
  );

  function syncThemeIcon(theme) {
    render(themeButton, icon(theme === 'dark' ? 'sun' : 'moon'));
  }

  /* ---------- Account menu ---------- */
  const userButton = el(
    'button.topbar__user',
    {
      type: 'button',
      'aria-label': 'Tài khoản',
      'aria-expanded': 'false',
    },
    [
      avatar({ user, size: 'sm', presence: true }),
      el('span.topbar__user-name', {}, user?.fullName ?? ''),
      icon('chevronDown'),
    ]
  );

  userButton.addEventListener('click', () => {
    openMenu({
      anchor: userButton,
      align: 'end',
      minWidth: '17rem',
      header: el('div.user-menu__head', {}, [
        avatar({ user, size: 'lg' }),
        el('div.stack-1', { style: { minWidth: 0 } }, [
          el('strong', { style: { fontSize: 'var(--text-sm)' } }, user?.fullName ?? ''),
          el('span.user-menu__id', {}, user?.studentId ?? ''),
        ]),
      ]),
      items: [
        { type: 'label', label: 'Điều hướng' },
        {
          label: 'Hồ sơ cá nhân',
          iconName: 'user',
          onSelect: () => {
            window.location.hash = '/profile';
          },
        },
        {
          label: 'Thời khóa biểu',
          iconName: 'calendar',
          onSelect: () => {
            window.location.hash = '/schedule';
          },
        },
        { type: 'separator' },
        {
          label: 'Đặt lại dữ liệu demo',
          iconName: 'refresh',
          onSelect: async () => {
            const { demo } = await import('../core/api.js');
            await demo.reset();
            toast({
              title: 'Đã khôi phục dữ liệu mẫu',
              message: 'Trang sẽ được tải lại.',
              variant: 'success',
            });
            setTimeout(() => window.location.reload(), 700);
          },
        },
        { type: 'separator' },
        {
          label: 'Đăng xuất',
          iconName: 'logout',
          danger: true,
          onSelect: async () => {
            const { signOut } = await import('../core/app-store.js');
            await signOut();
            window.location.hash = '/login';
          },
        },
      ],
    });
  });

  /* ---------- Assemble ---------- */
  const node = el('header.topbar', { role: 'banner' }, [
    navToggle,
    context,
    search,
    el('div.topbar__actions', {}, [
      clock,
      themeButton,
      bellNode,
      userButton,
    ]),
  ]);

  /* ---------- Reactive behaviour ---------- */
  syncThemeIcon(uiStore.getState().theme);

  uiStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) syncThemeIcon(state.theme);
    if (state.unreadNotifications !== prev.unreadNotifications) refreshBell();
  });

  window.addEventListener('hashchange', syncContext);
  window.addEventListener(ROUTE_EVENT, syncContext);

  function syncContext() {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    const active = NAV_ITEMS.find(
      (item) =>
        item.route === hash || (item.route !== '/' && hash.startsWith(item.route))
    );

    titleNode.textContent = active?.label ?? 'UTC Student';
    crumbNode.textContent = hash === '/' ? 'Trang chủ' : (active?.label ?? 'Chi tiết');
  }

  syncContext();

  return {
    node,
    focusSearch: () => searchInput.focus(),
    destroy: () => {
      clearInterval(clockTimer);
      document.removeEventListener('keydown', onGlobalKey);
      window.removeEventListener('hashchange', syncContext);
    },
  };
}

/**
 * The animated environment backdrop (aurora + grain + cursor spotlight).
 * Mounted once at the document root.
 */
export function createBackdrop() {
  const spotlight = el('div.backdrop__spotlight');

  const node = el('div.backdrop', { 'aria-hidden': 'true' }, [
    el('div.backdrop__wash'),
    el('div.backdrop__aurora', {}, [
      el('div.aurora-blob.aurora-blob--1'),
      el('div.aurora-blob.aurora-blob--2'),
      el('div.aurora-blob.aurora-blob--3'),
      el('div.aurora-blob.aurora-blob--4'),
    ]),
    el('div.backdrop__grid.texture-grid'),
    spotlight,
    el('div.backdrop__grain.texture-grain'),
    el('div.backdrop__vignette'),
  ]);

  // Cursor spotlight — pointer devices only, rAF-throttled
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (fine && !reduced) {
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let running = false;

    const loop = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      spotlight.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

      if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
        requestAnimationFrame(loop);
      } else {
        running = false;
      }
    };

    window.addEventListener(
      'pointermove',
      (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        spotlight.classList.add('is-active');
        if (!running) {
          running = true;
          requestAnimationFrame(loop);
        }
      },
      { passive: true }
    );

    document.addEventListener('pointerleave', () => spotlight.classList.remove('is-active'));
  }

  return node;
}