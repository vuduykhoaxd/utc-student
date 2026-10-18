/**
 * Profile
 *
 * Product rule: students may edit ONE field — the bio, capped at 500
 * characters. Every other attribute is issued by the school and is rendered
 * read-only, with a lock affordance and an explicit API-level rejection if a
 * crafted request tries to change them.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  badge,
  avatar,
  avatarStack,
  emptyState,
  notice,
  stat,
  progressRing,
  quickAction,
} from '../components/ui.js';
import { textarea } from '../components/forms.js';
import { pageHeader, section } from '../components/page.js';
import { users, documentsApi, postsApi, friends, BIO_MAX_LENGTH, LOCKED_PROFILE_FIELDS } from '../core/api.js';
import { authStore, toast } from '../core/app-store.js';
import { formatDate, formatNumber, percent, timeAgo } from '../utils/format.js';
import { confirmDialog } from '../components/overlay.js';

/** Recognised tokens highlighted inside the bio. */
const BIO_TOKENS = [/#[\p{L}\d_]+/gu, /\b(?:kỹ thuật|đồ án|nộp bài|ôn thi|deadline)\b/giu];

/** Decorative achievements — static demo shelf. */
const ACHIEVEMENTS = [
  { iconName: 'zap', name: 'Tham gia đầy đủ', date: 'HK1 2025', from: 'var(--signal-400)', to: 'var(--signal-600)' },
  { iconName: 'share', name: 'Chia sẻ 10 tài liệu', date: '03/11/2025', from: 'var(--brand-400)', to: 'var(--violet-600)' },
  { iconName: 'users', name: 'Kết nối 5 bạn mới', date: '28/10/2025', from: 'var(--accent-400)', to: 'var(--brand-600)' },
  { iconName: 'flame', name: 'Chuỗi 14 ngày', date: '01/11/2025', from: 'var(--danger-400)', to: 'var(--signal-500)' },
  { iconName: 'award', name: 'Top 10 lớp', date: 'HK1 2025', from: 'var(--success-400)', to: 'var(--accent-600)' },
];

/** @param {HTMLElement} outlet */
export async function profilePage(ctx) {
  const outlet = ctx.outlet;

  const user = authStore.getState().user;
  if (!user) return;

  const bioSlot = el('div.bio-panel');
  const statsSlot = el('div.profile-stats');

  let myPosts = [];
  let myDocs = [];
  let friendList = { accepted: [], incoming: [], outgoing: [] };

  try {
    const [posts, docs, friendData] = await Promise.all([
      postsApi.list({ scope: 'all', limit: 200 }),
      documentsApi.list({ pageSize: 100 }),
      friends.list(),
    ]);
    myPosts = posts.filter((p) => p.authorId === user.id);
    myDocs = docs.items.filter((d) => d.authorId === user.id);
    friendList = friendData;
  } catch (error) {
    console.warn('[profile] partial load failed:', error.message);
  }

  /* ---------- Stats ---------- */
  const completion = Math.round(percent(user.bio?.length ?? 0, BIO_MAX_LENGTH));

  render(statsSlot, 
    profileStat(friendList.accepted.length, 'Bạn bè'),
    divider(),
    profileStat(myPosts.length, 'Bài đăng'),
    divider(),
    profileStat(myDocs.length, 'Tài liệu'),
    divider(),
    profileStat(myPosts.reduce((sum, p) => sum + p.likes, 0), 'Lượt thích'),
    divider(),
    profileStat(friendList.incoming.length, 'Lời mời', friendList.incoming.length > 0)
  );

  function profileStat(value, label, highlight = false) {
    return el('button.profile-stat', {
      type: 'button',
      style: {
        color: highlight ? 'var(--primary)' : null,
        background: highlight ? 'var(--primary-soft)' : null,
      },
      onclick: () => {
        if (label === 'Bạn bè') window.location.hash = '/friends';
        if (label === 'Bài đăng') window.location.hash = '/posts';
        if (label === 'Tài liệu') window.location.hash = '/documents';
      },
    }, [
      el('span.profile-stat__value', {}, formatNumber(value)),
      el('span.profile-stat__label', {}, label),
    ]);
  }

  function divider() {
    return el('div.profile-stat__divider');
  }

  /* ---------- Bio panel ---------- */
  let editing = false;

  function drawBio() {
    if (!editing) {
      const text = user.bio?.trim();

      render(bioSlot, 
        el('div.bio-panel__label', {}, [
          icon('user'),
          el('span', {}, 'Giới thiệu bản thân'),
          el('span', { style: { marginLeft: 'auto' } }, badge({
            label: `${(user.bio ?? '').length}/${BIO_MAX_LENGTH}`,
            variant: 'neutral',
          })),
        ]),
        el('p', {
          class: `bio-text${text ? '' : ' bio-text--empty'}`,
          'data-reveal': 'left',
          html: text ? highlightBio(text) : 'Chưa có phần giới thiệu. Bạn có thể viết tối đa 500 ký tự.',
        }),
        el('div.row-2', { style: { justifyContent: 'flex-end', marginTop: 'var(--space-3)' } }, [
          button({
            label: editing ? '' : 'Chỉnh sửa',
            variant: 'soft',
            size: 'sm',
            iconName: 'edit',
            onclick: () => {
              editing = true;
              drawBio();
            },
          }),
        ])
      );
      return;
    }

    const field = textarea({
      id: 'bio-editor',
      value: user.bio ?? '',
      rows: 6,
      maxLength: BIO_MAX_LENGTH,
      placeholder: 'Giới thiệu ngắn gọn về bản thân, chuyên ngành, sở thích hoặc nhóm đồ án bạn đang tìm…',
      onInput: () => {
        saveBtn.disabled = field.value.trim() === (user.bio ?? '').trim();
      },
    });

    field.node.prepend(
      el('div.bio-panel__label', {}, [
        icon('edit'),
        el('span', {}, `Đang chỉnh sửa · tối đa ${BIO_MAX_LENGTH} ký tự`),
      ])
    );

    const saveBtn = button({
      label: 'Lưu thay đổi',
      iconName: 'check',
      size: 'sm',
      onclick: async () => {
        saveBtn.classList.add('btn--loading');
        try {
          const updated = await users.updateProfile({ bio: field.value });
          authStore.setState({ user: { ...authStore.getState().user, ...updated } });
          editing = false;
          toast({
            title: 'Đã cập nhật giới thiệu',
            message: 'Thay đổi của bạn đã được lưu.',
            variant: 'success',
          });
          drawBio();
        } catch (error) {
          toast({ title: 'Không lưu được', message: error.message, variant: 'error' });
        } finally {
          saveBtn.classList.remove('btn--loading');
        }
      },
    });

    field.element.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveBtn.click();
    });

    render(bioSlot, 
      field.node,
      el('div.bio-edit__toolbar', {}, [
        el('span.caption', {}, [
          'Nhấn ',
          el('kbd', {}, 'Ctrl'),
          ' + ',
          el('kbd', {}, 'Enter'),
          ' để lưu nhanh',
        ]),
        el('div.bio-edit__actions', {}, [
          button({
            label: 'Huỷ',
            variant: 'ghost',
            size: 'sm',
            onclick: () => {
              editing = false;
              drawBio();
            },
          }),
          saveBtn,
        ]),
      ])
    );

    setTimeout(() => field.focus(), 60);
  }

  drawBio();

  /* ---------- Assemble ---------- */
  const view = el('div.page', {}, [
    el('section.profile-hero', { 'data-reveal': 'zoom' }, [
      el('div.profile-hero__banner'),
      el('div.profile-hero__scrim'),
      el('div.profile-hero__top', {}, [
        el('div.profile-hero__id', {}, [
          el('div.profile-hero__avatar', {}, avatar({ user })),
          el('div.stack-1', { style: { minWidth: 0 } }, [
            el('h1.profile-hero__name', {}, user.fullName),
            el('span.profile-hero__role', {}, `${user.role} · ${user.className}`),
            el('div.profile-hero__badges', {}, [
              el(
                'button.profile-hero__student-id',
                {
                  type: 'button',
                  title: 'Sao chép mã sinh viên',
                  onclick: async () => {
                    try {
                      await navigator.clipboard.writeText(user.studentId);
                      toast({ title: 'Đã sao chép mã sinh viên', message: user.studentId, variant: 'success' });
                    } catch {
                      toast({ title: 'Không sao chép được', variant: 'warn' });
                    }
                  },
                },
                [icon('idCard'), el('span', {}, user.studentId), icon('copy')]
              ),
              user.scholar && user.scholar !== 'Không'
                ? badge({ label: user.scholar, variant: 'signal', iconName: 'award' })
                : null,
              badge({ label: user.cohort, variant: 'neutral' }),
              badge({
                label: user.presence === 'online' ? 'Đang hoạt động' : 'Không hoạt động',
                variant: user.presence === 'online' ? 'success' : 'neutral',
                dot: true,
              }),
            ]),
          ]),
        ]),
        el('div.profile-hero__actions', {}, [
          button({
            label: 'Sửa hồ sơ',
            variant: 'secondary',
            iconName: 'edit',
            onclick: () => {
              editing = true;
              drawBio();
              document.querySelector('.bio-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
          }),
          quickAction({ iconName: 'messages', label: 'Nhắn tin', onclick: () => (window.location.hash = '/chat') }),
        ]),
      ]),
    ]),

    statsSlot,

    el('div.split', {}, [
      el('div.stack-5', {}, [
        bioSlot,

        panel({
          title: 'Thông tin học vụ',
          titleIcon: 'graduation',
          actions: [badge({ label: 'Không thể chỉnh sửa', variant: 'neutral', iconName: 'lock' })],
          body: [
            el('div.lock-notice', {}, [
              icon('shield'),
              el('span', {},
                'Các thông tin dưới đây do Nhà trường quản lý và được đồng bộ từ hệ thống quản lý đào tạo. Nếu cần điều chỉnh, vui lòng liên hệ khoa hoặc Phòng Đào tạo.'),
            ]),
            el('div.info-grid.mt-4', {}, [
              infoField('Họ và tên', user.fullName, 'user'),
              infoField('Mã sinh viên', user.studentId, 'idCard', true),
              infoField('Khoa', user.faculty, 'building'),
              infoField('Ngành', user.major, 'book'),
              infoField('Lớp', user.className, 'users'),
              infoField('Niên khóa', user.cohort, 'graduation'),
              infoField('Email trường', user.schoolEmail, 'messageCircle', true),
              infoField('Email cá nhân', user.email, 'inbox'),
              infoField('Số điện thoại', user.phone, 'phone', true),
              infoField('Ngày sinh', formatDate(user.birthDate, 'short'), 'calendar'),
              infoField('Địa chỉ', user.address, 'mapPin'),
              infoField('Tình trạng', user.status === 'active' ? 'Đang học' : user.status, 'check'),
            ]),
          ],
        }),

        panel({
          title: 'Hoạt động của bạn',
          titleIcon: 'flame',
          body: el('div.grid.grid-auto', {}, [
            ...myDocs.slice(0, 4).map((doc) =>
              el(
                'div.doc.ft-pdf-doc',
                {
                  role: 'button',
                  tabindex: '0',
                  'data-reveal': 'zoom',
                  onclick: () => (window.location.hash = '/documents'),
                },
                [
                  el('div.doc__head', {}, [
                    el('span.file-glyph', {}, [icon('fileText'), el('span.file-glyph__ext', {}, (doc.fileName.split('.').pop() ?? '').toUpperCase())]),
                    el('div.doc__titles', {}, [
                      el('span.doc__course', {}, [icon('book'), doc.courseCode]),
                      el('span.doc__title.clamp-2', {}, doc.title),
                    ]),
                  ]),
                  el('div.doc__meta', {}, [
                    el('span', {}, `${doc.downloads} lượt tải`),
                    el('span.doc__meta-sep'),
                    el('span', {}, timeAgo(doc.createdAt)),
                  ]),
                ]
              )
            ),
            myDocs.length === 0
              ? emptyState({ iconName: 'folder', title: 'Chưa chia sẻ tài liệu nào', message: 'Chia sẻ tài liệu để bạn bè cùng học.' })
              : null,
          ]),
        }),
      ]),

      el('aside.sticky-aside', {}, [
        panel({
          title: 'Hoàn thiện hồ sơ',
          titleIcon: 'target',
          body: el('div.stack-4', {}, [
            el('div.row-4', { style: { justifyContent: 'center' } }, [
              progressRing({
                percent: completion,
                caption: 'Tiểu sử',
                color: completion >= 80 ? 'var(--success)' : 'var(--signal)',
              }),
            ]),
            el('p.caption', { style: { textAlign: 'center' } },
              completion >= 80
                ? 'Hồ sơ của bạn đã đầy đủ. Hồ sơ đầy đủ giúp bạn bè dễ nhận biết bạn hơn.'
                : `Viết thêm ${BIO_MAX_LENGTH - (user.bio?.length ?? 0)} ký tự để hồ sơ đầy đủ hơn.`),
            button({
              label: 'Viết giới thiệu',
              variant: 'soft',
              size: 'sm',
              block: true,
              iconName: 'edit',
              onclick: () => {
                editing = true;
                drawBio();
              },
            }),
          ]),
        }),

        panel({
          title: 'Bạn bè',
          titleIcon: 'users',
          actions: [
            el('a.btn.btn--ghost.btn--sm', { href: '#/friends' }, 'Xem tất cả'),
          ],
          body: friendList.accepted.length
            ? el('div.stack-3', {}, [
                avatarStack({
                  users: friendList.accepted.map((f) => f).concat(friendList.accepted),
                  max: 5,
                }),
                el('div.row-2.row-wrap', {}, friendList.accepted.slice(0, 6).map((friend) => avatar({ user: friend, size: 'sm', presence: true }))),
                el('span.caption', {}, `${friendList.accepted.length} bạn đã kết nối`),
              ])
            : emptyState({
                iconName: 'users',
                title: 'Chưa kết bạn với ai',
                message: 'Tìm bạn bè bằng mã sinh viên để bắt đầu.',
                action: button({
                  label: 'Tìm bạn bè',
                  variant: 'soft',
                  size: 'sm',
                  iconName: 'search',
                  onclick: () => (window.location.hash = '/friends'),
                }),
              }),
        }),

        panel({
          title: 'Thành tích',
          titleIcon: 'award',
          body: el('div.shelf', {}, ACHIEVEMENTS.map((achievement, index) =>
            el(
              'div.achievement',
              {
                'data-reveal': 'zoom',
                style: { '--reveal-delay': `${index * 60}ms`, '--ach-from': achievement.from, '--ach-to': achievement.to },
                title: achievement.name,
              },
              [
                el('div.achievement__medal', {}, icon(achievement.iconName)),
                el('span.achievement__name', {}, achievement.name),
                el('span.achievement__date', {}, achievement.date),
              ]
            )
          )),
        }),
      ]),
    ]),
  ]);

  render(outlet, view);
  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}

/** Read-only field row. */
function infoField(label, value, iconName, mono = false) {
  return el('div.info-item.info-item--locked', { title: 'Không thể chỉnh sửa' }, [
    el('div.info-item__label', {}, [
      el('span', { style: { display: 'inline-flex' } }, icon(iconName)),
      el('span', {}, label),
    ]),
    el('span.info-item__value', { class: mono ? 'info-item__value--mono' : '' }, value ?? '—'),
    el('span.info-item__lock', { 'aria-hidden': 'true' }, icon('lock')),
  ]);
}

/** Wrap hashtags and keywords in <mark>. Input is escaped first. */
function highlightBio(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return BIO_TOKENS.reduce(
    (accumulator, pattern) => accumulator.replace(new RegExp(pattern, 'giu'), (match) => `<mark>${match}</mark>`),
    escaped
  );
}

export { LOCKED_PROFILE_FIELDS, confirmDialog };
