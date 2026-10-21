/**
 * Notifications
 * Full inbox of in-app notifications with category filters and bulk actions.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  badge,
  emptyState,
  segmented,
  avatar,
} from '../components/ui.js';
import { pageHeader, section } from '../components/page.js';
import { notificationsApi } from '../core/api.js';
import { toast, refreshUnread } from '../core/app-store.js';
import { formatDate } from '../utils/format.js';

const META = {
  news: { iconName: 'news', label: 'Tin tức', tone: 'primary', route: '/news' },
  grade: { iconName: 'award', label: 'Điểm số', tone: 'success', route: '/schedule' },
  chat: { iconName: 'messages', label: 'Tin nhắn', tone: 'accent', route: '/chat' },
  friend: { iconName: 'users', label: 'Bạn bè', tone: 'violet', route: '/friends' },
  post: { iconName: 'messages', label: 'Bài đăng', tone: 'brand', route: '/posts' },
  doc: { iconName: 'fileText', label: 'Tài liệu', tone: 'signal', route: '/documents' },
  alert: { iconName: 'alert', label: 'Quan trọng', tone: 'danger', route: '/notifications' },
};

const TONE_COLOR = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  signal: 'var(--signal)',
  violet: 'var(--violet)',
  danger: 'var(--danger)',
  success: 'var(--success)',
  brand: 'var(--brand)',
};

/** @param {HTMLElement} outlet */
export async function notificationsPage(ctx) {
  const outlet = ctx.outlet;

  const state = { items: [], filter: 'all' };

  const listNode = el('div.stack-2');
  const summarySlot = el('div.grid.grid-auto-sm');

  async function load() {
    try {
      state.items = await notificationsApi.list();
    } catch (error) {
      console.error(error);
      state.items = [];
    }
    draw();
  }

  function draw() {
    const unread = state.items.filter((n) => !n.read).length;

    render(summarySlot, 
      summaryCard('Chưa đọc', unread, 'bell', 'var(--primary)', 'var(--primary-soft)'),
      summaryCard('Tổng số', state.items.length, 'inbox', 'var(--accent)', 'var(--accent-soft)'),
      summaryCard('Quan trọng', state.items.filter((n) => n.category === 'alert').length, 'alert', 'var(--danger)', 'var(--danger-soft)'),
      summaryCard('Tin nhắn', state.items.filter((n) => n.category === 'chat').length, 'messages', 'var(--violet)', 'var(--violet-soft)')
    );

    const filtered =
      state.filter === 'all'
        ? state.items
        : state.filter === 'unread'
          ? state.items.filter((n) => !n.read)
          : state.items.filter((n) => n.category === state.filter);

    if (!filtered.length) {
      render(listNode, 
        emptyState({
          iconName: state.filter === 'unread' ? 'checkCheck' : 'inbox',
          title: state.filter === 'unread' ? 'Đã đọc hết rồi' : 'Không có thông báo nào',
          message:
            state.filter === 'unread'
              ? 'Bạn không còn thông báo chưa đọc nào. Tuyệt vời!'
              : 'Thông báo mới sẽ xuất hiện ở đây.',
          action:
            state.filter !== 'all'
              ? button({
                  label: 'Xem tất cả',
                  variant: 'soft',
                  size: 'sm',
                  onclick: () => {
                    state.filter = 'all';
                    switcher.update('all');
                    draw();
                  },
                })
              : null,
        })
      );
      return;
    }

    render(listNode, 
      ...filtered.map((item, index) => notificationRow(item, index))
    );
  }

  function notificationRow(item, index) {
    const meta = META[item.category] ?? META.news;

    return el(
      'div.notif',
      {
        class: `notif--${item.category} ${item.read ? '' : 'notif--unread'}`,
        'data-reveal': 'left',
        style: { '--reveal-delay': `${Math.min(index, 8) * 50}ms` },
        role: 'button',
        tabindex: '0',
        onclick: async () => {
          await notificationsApi.markRead(item.id);
          item.read = true;
          refreshUnread();
          draw();
          if (item.route && item.route !== '/notifications') window.location.hash = item.route;
        },
      },
      [
        el('span.notif__icon', { style: { '--notif-color': TONE_COLOR[meta.tone] } }, icon(meta.iconName)),
        el('div.notif__body', {}, [
          el('div.row-2', { style: { gap: 'var(--space-2)' } }, [
            el('span.notif__title', {}, item.title),
            !item.read ? badge({ label: 'Mới', variant: 'primary' }) : null,
          ]),
          el('span.notif__msg', {}, item.message),
          el('span.notif__time', {}, `${formatDate(item.createdAt, 'datetime')} · ${item.relativeTime}`),
        ]),
        el('div.notif__actions', {}, [
          el(
            'button.quick-action',
            {
              type: 'button',
              'aria-label': 'Xoá thông báo',
              title: 'Xoá',
              onclick: async (event) => {
                event.stopPropagation();
                await notificationsApi.remove(item.id);
                state.items = state.items.filter((n) => n.id !== item.id);
                refreshUnread();
                draw();
              },
            },
            icon('trash')
          ),
        ]),
      ]
    );
  }

  function summaryCard(label, value, iconName, color, tint) {
    return el('div.stat', { 'data-reveal': 'zoom' }, [
      el('div.row-between', {}, [
        el('span.stat__label', {}, [
          el('span.stat__icon', { style: { backgroundColor: tint, color } }, icon(iconName)),
          el('span', {}, label),
        ]),
      ]),
      el('span.stat__value', {}, String(value)),
    ]);
  }

  const switcher = segmented({
    items: [
      { id: 'all', label: 'Tất cả', iconName: 'inbox' },
      { id: 'unread', label: 'Chưa đọc', iconName: 'bell' },
      { id: 'chat', label: 'Tin nhắn', iconName: 'messages' },
      { id: 'friend', label: 'Bạn bè', iconName: 'users' },
      { id: 'post', label: 'Bài đăng', iconName: 'messages' },
      { id: 'grade', label: 'Điểm số', iconName: 'award' },
      { id: 'alert', label: 'Quan trọng', iconName: 'alert' },
    ],
    active: state.filter,
    onChange: (id) => {
      state.filter = id;
      switcher.update(id);
      draw();
    },
  });

  const view = el('div.page', {}, [
    pageHeader({
      eyebrow: 'Cá nhân',
      eyebrowIcon: 'bell',
      title: 'Thông báo',
      subtitle: 'Tất cả cập nhật từ nhà trường, đồng môn và hệ thống học tập.',
      actions: [
        button({
          label: 'Đánh dấu đã đọc tất cả',
          variant: 'secondary',
          iconName: 'checkCheck',
          onclick: async () => {
            await notificationsApi.markAllRead();
            state.items.forEach((item) => {
              item.read = true;
            });
            refreshUnread();
            draw();
            toast({ title: 'Đã đánh dấu tất cả là đã đọc', variant: 'success' });
          },
        }),
      ],
    }),
    summarySlot,
    el('div.toolbar', {}, [switcher.node]),
    listNode,
  ]);

  render(outlet, view);
  await load();
  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}
