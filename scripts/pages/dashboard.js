/**
 * Dashboard
 * Aggregated home view: greeting + countdown, stat tiles, today's agenda,
 * upcoming news, attendance, activity feed.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  stat,
  avatar,
  avatarStack,
  badge,
  progressRing,
  labelledBar,
  iconTile,
  emptyState,
} from '../components/ui.js';
import { pageHeader, section, split } from '../components/page.js';
import { dashboard, schedule as scheduleApi, newsApi } from '../core/api.js';
import { authStore, refreshUnread, toast } from '../core/app-store.js';
import {
  countdownParts,
  formatDate,
  formatTime,
  timeAgo,
  toMinutes,
  WEEKDAY_FULL,
  percent,
} from '../utils/format.js';
import { students } from '../data/seed.js';

/** Greeting that changes with the time of day. */
function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Khuya rồi';
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 14) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Quick-access shortcuts. */
const SHORTCUTS = [
  { route: '/schedule', label: 'Thời khóa biểu', desc: 'Tuần học & lịch thi', iconName: 'calendar', tone: 'primary' },
  { route: '/documents', label: 'Tài liệu', desc: 'Tải & chia sẻ học liệu', iconName: 'folder', tone: 'accent' },
  { route: '/posts', label: 'Bài đăng', desc: 'Xem & đăng truyền tin', iconName: 'messages', tone: 'violet' },
  { route: '/chat', label: 'Tin nhắn', desc: 'Trò chuyện với bạn', iconName: 'users', tone: 'success' },
];

/**
 * @param {HTMLElement} outlet
 * @param {{navigate: Function}} ctx - Router context.
 */
export async function dashboardPage(ctx) {
  const outlet = ctx.outlet;

  render(outlet, loadingBlock());

  let data;
  let todaySessions;
  let upcomingNews;

  try {
    [data, todaySessions, upcomingNews] = await Promise.all([
      dashboard.summary(),
      scheduleApi.getDay(new Date()),
      newsApi.list({ limit: 3 }),
    ]);
  } catch (error) {
    console.error(error);
    render(outlet, 
      el('div.empty-state', {}, [
        el('span.empty-state__icon', {}, icon('alert')),
        el('h3.section-title', {}, 'Không tải được dữ liệu tổng quan'),
        el('p.body-text', {}, error.message),
        button({ label: 'Thử lại', iconName: 'refresh', onclick: () => dashboardPage(ctx) }),
      ])
    );
    return;
  }

  const { user, stats, nextExam, courses, recentActivity } = data;
  const firstName = user.fullName.split(' ').slice(-2, -1)[0] || user.fullName;

  /* ---------- Hero ---------- */
  const hero = el('section.hero', { 'data-reveal': 'zoom' }, [
    el('div.hero__content', {}, [
      el('span.hero__eyebrow', {}, [
        icon('sparkle'),
        el('span', {}, `${WEEKDAY_FULL[new Date().getDay()]}, ${formatDate(new Date(), 'medium')}`),
      ]),
      el('h1.hero__title', {}, [
        `${greeting()}, `,
        el('em', {}, `${firstName}!`),
      ]),
      el('p.hero__sub', {}, heroSentence(stats, nextExam)),
      el('div.hero__actions', {}, [
        button({
          label: 'Xem thời khóa biểu',
          iconName: 'calendar',
          onclick: () => (window.location.hash = '/schedule'),
        }),
        button({
          label: 'Tìm tài liệu',
          variant: 'secondary',
          iconName: 'search',
          onclick: () => (window.location.hash = '/documents'),
        }),
      ]),
    ]),
    countdownCard(nextExam),
  ]);

  /* ---------- Stat tiles ---------- */
  const statRow = el('div.grid.grid-auto-sm', {}, [
    stat({
      label: 'Thông báo mới',
      value: stats.unreadNews + stats.notificationsUnread,
      iconName: 'bell',
      meta: `${stats.unreadNews} tin tức · ${stats.notificationsUnread} thông báo`,
      tint: 'var(--primary-soft)',
      onclick: () => (window.location.hash = '/news'),
    }),
    stat({
      label: 'Tin nhắn chưa đọc',
      value: stats.totalUnreadMessages,
      iconName: 'messages',
      meta: 'Trong các cuộc trò chuyện',
      tint: 'var(--accent-soft)',
      onclick: () => (window.location.hash = '/chat'),
    }),
    stat({
      label: 'Bạn bè',
      value: stats.friendCount,
      iconName: 'users',
      meta: `${stats.myPosts} bài đăng của bạn`,
      tint: 'var(--violet-soft)',
      onclick: () => (window.location.hash = '/friends'),
    }),
    stat({
      label: 'Chuyên cần',
      value: `${stats.attendanceAverage}%`,
      iconName: 'graduation',
      meta: `Trung bình ${stats.courses} môn đang học`,
      tint: 'var(--success-soft)',
      onclick: () => (window.location.hash = '/schedule'),
    }),
  ]);

  /* ---------- Quick access ---------- */
  const quickGrid = el('div.quick-grid', {}, SHORTCUTS.map((shortcut, index) =>
    el(
      'button.quick-card.spotlight',
      {
        type: 'button',
        'data-spotlight': '',
        style: { '--reveal-delay': `${index * 60}ms` },
        'data-reveal': 'zoom',
        onclick: () => (window.location.hash = shortcut.route),
      },
      [
        iconTile({ iconName: shortcut.iconName, tone: shortcut.tone }),
        el('span.quick-card__label', {}, shortcut.label),
        el('span.quick-card__desc', {}, shortcut.desc),
      ]
    )
  ));

  /* ---------- Today's agenda ---------- */
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const agendaBody = todaySessions.length
    ? el('div.timeline', {}, todaySessions.map((session, index) => {
        const start = toMinutes(session.start);
        const end = toMinutes(session.end);
        const isPast = end < nowMinutes;
        const isNow = start <= nowMinutes && end >= nowMinutes;

        return el(
          'div.timeline__item',
          {
            class: [isPast ? 'timeline__item--past' : '', isNow ? 'timeline__item--now' : '']
              .filter(Boolean)
              .join(' '),
            'data-reveal': '',
            style: { '--reveal-delay': `${index * 70}ms` },
          },
          [
            el('span.timeline__node', {
              style: { '--node-color': `var(--${['brand', 'violet', 'accent', 'signal', 'success', 'danger'][session.colorIndex % 6]}-400)` },
            }),
            el(
              'div.timeline__card',
              {
                role: 'button',
                tabindex: '0',
                onclick: () => (window.location.hash = '/schedule'),
              },
              [
                el('div.row-between', {}, [
                  el('span.timeline__time', {}, `${session.start} – ${session.end}`),
                  isNow ? badge({ label: 'Đang học', variant: 'primary', dot: true }) : null,
                ]),
                el('span.timeline__title', {}, session.courseName),
                el('span.timeline__meta', {}, [
                  icon('mapPin'),
                  ` ${session.room} · ${session.teacher}`,
                ]),
              ]
            ),
          ]
        );
      }))
    : emptyState({
        iconName: 'sparkle',
        title: 'Hôm nay không có tiết học',
        message: 'Tận dụng ngày nghỉ để ôn tập hoặc tìm tài liệu nhé.',
        action: button({
          label: 'Xem tài liệu',
          variant: 'soft',
          iconName: 'folder',
          onclick: () => (window.location.hash = '/documents'),
        }),
      });

  /* ---------- News preview ---------- */
  const newsBody = upcomingNews.length
    ? el('div.news-preview', {}, upcomingNews.map((item, index) =>
        el(
          'div.news-preview__item',
          {
            role: 'button',
            tabindex: '0',
            'data-reveal': '',
            style: { '--reveal-delay': `${index * 70}ms` },
            onclick: () => (window.location.hash = `/news/${item.id}`),
          },
          [
            iconTile({ iconName: item.urgent ? 'alert' : 'news', tone: item.urgent ? 'danger' : 'primary', size: 'sm' }),
            el('div.grow', { style: { minWidth: 0 } }, [
              el('div.clamp-2', {
                style: { fontSize: 'var(--text-sm)', fontWeight: 600, lineHeight: 1.4 },
              }, item.title),
              el('span.caption', {}, timeAgo(item.publishedAt)),
            ]),
          ]
        )
      ))
    : emptyState({ iconName: 'news', title: 'Chưa có tin tức mới' });

  /* ---------- Attendance ---------- */
  const attendanceBody = el('div.stack-4', {}, [
    el('div.row-4', { style: { justifyContent: 'center', paddingBlock: 'var(--space-2)' } }, [
      progressRing({ percent: stats.attendanceAverage, caption: 'Chuyên cần', color: 'var(--success)' }),
      el('div.stack-1', {}, [
        el('span.overline', {}, 'Tổng hợp học kỳ'),
        el('strong', { style: { fontSize: 'var(--text-md)' } }, `${stats.courses} môn đang học`),
        el('span.caption', {}, 'Điểm danh được ghi nhận tự động khi bạn vào lớp.'),
      ]),
    ]),
    el('div.divider'),
    ...courses.slice(0, 5).map((course, index) =>
      el('div', { 'data-reveal': 'left', style: { '--reveal-delay': `${index * 60}ms` } },
        labelledBar({
          label: course.name,
          percent: course.attendance,
          from: `var(--${['brand', 'violet', 'accent', 'signal', 'success', 'danger'][course.colorIndex % 6]}-400)`,
          to: `var(--${['accent', 'brand', 'violet', 'danger', 'accent', 'signal'][course.colorIndex % 6]}-400)`,
        })
      )
    ),
  ]);

  /* ---------- Activity ---------- */
  const activityBody = recentActivity.length
    ? el('div.feed', {}, recentActivity.map((item, index) =>
        el('div.feed__item', { 'data-reveal': '', style: { '--reveal-delay': `${index * 60}ms` } }, [
          el('div.feed__rail', {}, avatar({ user: item.author, size: 'sm' })),
          el('div.feed__body', {}, [
            el('span.feed__text', {}, [
              el('strong', {}, item.author?.fullName ?? 'Ai đó'),
              ' ',
              item.text,
            ]),
            el('span.feed__time', {}, item.relativeTime),
          ]),
          el('button.quick-action', {
            type: 'button',
            'aria-label': 'Xem chi tiết',
            onclick: () => (window.location.hash = item.route),
          }, icon('arrowUpRight')),
        ])
      ))
    : emptyState({ iconName: 'sparkle', title: 'Chưa có hoạt động nào' });

  /* ---------- Assemble ---------- */
  const view = el('div.dash', {}, [
    hero,
    statRow,
    quickGrid,
    split({
      main: [
        panel({
          title: 'Lịch học hôm nay',
          titleIcon: 'calendar',
          actions: [
            el('a.btn.btn--ghost.btn--sm', { href: '#/schedule' }, 'Xem tuần'),
          ],
          body: agendaBody,
        }),
        panel({
          title: 'Hoạt động gần đây',
          titleIcon: 'trending',
          body: activityBody,
        }),
      ],
      aside: [
        panel({ title: 'Tin & Thông báo', titleIcon: 'megaphone', body: newsBody }),
        panel({ title: 'Chuyên cần', titleIcon: 'graduation', body: attendanceBody }),
        panel({
          title: 'Tài liệu đã chia sẻ',
          titleIcon: 'folder',
          body: el('div.stack-4', {}, [
            el('div.row-between', {}, [
              el('div.stack-1', {}, [
                el('strong', { style: { fontSize: 'var(--text-2xl)', fontFamily: 'var(--font-display)' } }, String(stats.sharedDocs)),
                el('span.caption', {}, 'Tài liệu bạn đã đóng góp'),
              ]),
              iconTile({ iconName: 'share', tone: 'accent', size: 'lg' }),
            ]),
            el('div.progress-bar', {}, [
              el('div.storage-meter__fill', {
        style: {
          '--usage': `${Math.min(100, stats.sharedDocs * 9)}%`,
          '--usage-scale': String(Math.min(1, (stats.sharedDocs * 9) / 100)),
        },
      }),
            ]),
            el('p.caption', {}, 'Cảm ơn bạn đã đóng góp tài liệu cho lớp học.'),
            button({
              label: 'Chia sẻ tài liệu',
              variant: 'soft',
              size: 'sm',
              block: true,
              iconName: 'upload',
              onclick: () => (window.location.hash = '/documents?action=share'),
            }),
          ]),
        }),
      ],
    }),
  ]);

  render(outlet, view);

  // Kick the counters + staggered reveals
  const { enhance } = await import('../utils/motion.js');
  enhance(view);
}

/** Compose the hero subtitle from live stats. */
function heroSentence(stats, nextExam) {
  if (stats.totalUnreadMessages > 0) {
    return `Bạn có ${stats.totalUnreadMessages} tin nhắn chưa đọc và ${stats.unreadNews + stats.notificationsUnread} thông báo mới đang chờ bạn.`;
  }
  if (nextExam) {
    return `Kỳ thi giữa kỳ ${nextExam.courseName} còn ${nextExam.daysLeft} ngày. Hãy lên kế hoạch ôn tập sớm nhé.`;
  }
  return 'Không có gì cấp bách hôm nay. Một ngày học tập hiệu quả bắt đầu từ kế hoạch rõ ràng.';
}

/** Countdown widget for the next exam. */
function countdownCard(exam) {
  if (!exam) {
    return el('div.hero__countdown', {}, [
      el('span.countdown__label', {}, 'Kỳ thi sắp tới'),
      el('span.countdown__course', {}, 'Chưa có kỳ thi nào'),
      el('span.countdown__room', {}, 'Chúc bạn học tập hiệu quả!'),
    ]);
  }

  const values = {
    days: el('span.countdown__num', {}, '00'),
    hours: el('span.countdown__num', {}, '00'),
    minutes: el('span.countdown__num', {}, '00'),
    seconds: el('span.countdown__num', {}, '00'),
  };

  const unit = (label, key) =>
    el('div.countdown__unit', {}, [values[key], el('span.countdown__unit-label', {}, label)]);

  const node = el('div.hero__countdown', {}, [
    el('span.countdown__label', {}, `Còn ${exam.daysLeft} ngày · ${exam.type}`),
    el('div.countdown__value', {}, [
      unit('ngày', 'days'),
      el('span.countdown__sep', {}, ':'),
      unit('giờ', 'hours'),
      el('span.countdown__sep', {}, ':'),
      unit('phút', 'minutes'),
      el('span.countdown__sep', {}, ':'),
      unit('giây', 'seconds'),
    ]),
    el('span.countdown__course', {}, exam.courseName),
    el('span.countdown__room', {}, `${exam.courseCode} · ${exam.room}`),
  ]);

  const timer = setInterval(() => {
    const parts = countdownParts(exam.date);
    if (parts.done) {
      clearInterval(timer);
      return;
    }
    values.days.textContent = String(parts.days).padStart(2, '0');
    values.hours.textContent = String(parts.hours).padStart(2, '0');
    values.minutes.textContent = String(parts.minutes).padStart(2, '0');
    values.seconds.textContent = String(parts.seconds).padStart(2, '0');
  }, 1000);

  node.addEventListener('remove', () => clearInterval(timer));
  const observer = new MutationObserver(() => {
    if (!node.isConnected) {
      clearInterval(timer);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return node;
}

/** Placeholder shown while the dashboard request is in flight. */
function loadingBlock() {
  return el('div.dash', {}, [
    el('div.skeleton', { style: { height: '13rem', borderRadius: 'var(--radius-2xl)' } }),
    el('div.grid.grid-auto-sm', {}, Array.from({ length: 4 }, () =>
      el('div.skeleton', { style: { height: '7rem', borderRadius: 'var(--radius-lg)' } })
    )),
  ]);
}
