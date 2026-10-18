/**
 * Find friends
 * The primary lookup path is a student ID. Requests, accept / decline, and a
 * suggested-network rail round out the feature.
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
} from '../components/ui.js';
import { pageHeader, section } from '../components/page.js';
import { friends as friendsApi } from '../core/api.js';
import { toast } from '../core/app-store.js';
import { timeAgo, formatNumber } from '../utils/format.js';
import { students } from '../data/seed.js';

/** @param {HTMLElement} outlet */
export async function friendsPage(ctx) {
  const outlet = ctx.outlet;

  let state = { accepted: [], incoming: [], outgoing: [], suggestions: [] };

  const resultSlot = el('div');
  const requestSlot = el('div.stack-3');
  const acceptedSlot = el('div');
  const suggestionSlot = el('div.grid.grid-auto');

  /* ---------- Search console ---------- */
  const searchInputNode = el('input', {
    type: 'text',
    name: 'student-id',
    placeholder: 'Nhập mã sinh viên',
    autocomplete: 'off',
    spellcheck: 'false',
    inputmode: 'numeric',
    maxlength: '15',
    'data-autofocus': '',
    'aria-label': 'Mã sinh viên cần tìm',
  });

  const searchHint = el('div.student-id-input__hint', {}, [
    'Thử với mẫu: ',
    ...students.slice(1, 4).map((student, index) =>
      el(
        'button.btn.btn--link',
        {
          type: 'button',
          onclick: () => {
            searchInputNode.value = student.studentId;
            performSearch();
          },
        },
        student.studentId
      )
    ),
  ]);

  const scanIndicator = el('span.student-id-input__scan', { 'aria-hidden': 'true' }, icon('scan'));

  const searchButton = button({
    variant: 'primary',
    size: 'lg',
    iconName: 'search',
    label: 'Tìm',
    onclick: performSearch,
  });

  const console = el('div.search-console', { 'data-reveal': 'zoom' }, [
    el('div.search-console__head', {}, [
      el('h2.search-console__title', {}, 'Tìm bạn bè bằng mã sinh viên'),
      el('p.search-console__desc', {},
        'Mỗi tài khoản sinh viên tại Trường đều có một mã riêng do Nhà trường cấp. Nhập mã của bạn bè để kết nối — không cần email hay số điện thoại.'),
    ]),
    el('div.row-3', { style: { justifyContent: 'center', flexWrap: 'wrap' } }, [
      el('div.student-id-input', {}, [
        el('span.student-id-input__icon', {}, icon('idCard')),
        searchInputNode,
        scanIndicator,
        searchButton,
      ]),
    ]),
    searchHint,
  ]);

  searchInputNode.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') performSearch();
  });

  /* ---------- Search ---------- */
  async function performSearch() {
    const code = searchInputNode.value.trim();

    if (!code) {
      toast({ title: 'Chưa nhập mã sinh viên', variant: 'warn' });
      searchInputNode.focus();
      return;
    }

    searchButton.classList.add('btn--loading');
    searchButton.disabled = true;

    try {
      const person = await friendsApi.search({ studentId: code });
      drawResult(person);
    } catch (error) {
      render(resultSlot, 
        notice({
          text: error.message,
          variant: 'error',
          iconName: 'search',
        })
      );
    } finally {
      searchButton.classList.remove('btn--loading');
      searchButton.disabled = false;
    }
  }

  function drawResult(person) {
    const actionArea = el('div.friend-card__actions');

    if (person.isSelf) {
      actionArea.appendChild(badge({ label: 'Đó là bạn', variant: 'primary', iconName: 'user' }));
    } else if (person.relation === 'accepted') {
      actionArea.appendChild(badge({ label: 'Đã là bạn bè', variant: 'success', iconName: 'check' }));
      actionArea.appendChild(
        button({
          label: 'Nhắn tin',
          variant: 'soft',
          size: 'sm',
          iconName: 'messages',
          onclick: () => (window.location.hash = `/chat?to=${person.studentId}`),
        })
      );
    } else if (person.relation === 'pending') {
      actionArea.appendChild(badge({ label: 'Đang chờ phản hồi', variant: 'signal', pulse: true }));
      actionArea.appendChild(
        button({
          label: 'Hủy lời mời',
          variant: 'ghost',
          size: 'sm',
          iconName: 'close',
          onclick: async () => {
            await friendsApi.decline({ friendshipId: person.friendshipId });
            toast({ title: 'Đã hủy lời mời', variant: 'info' });
            await reload();
            performSearch();
          },
        })
      );
    } else {
      actionArea.appendChild(
        button({
          label: 'Kết bạn',
          variant: 'primary',
          size: 'sm',
          iconName: 'user',
          onclick: async (event) => {
            const btn = event.currentTarget;
            btn.classList.add('btn--loading');
            try {
              await friendsApi.request({ studentId: person.studentId });
              toast({
                title: 'Đã gửi lời mời kết bạn',
                message: `Đã gửi tới ${person.fullName}.`,
                variant: 'success',
              });
              await reload();
              performSearch();
            } catch (error) {
              toast({ title: 'Không gửi được', message: error.message, variant: 'error' });
              btn.classList.remove('btn--loading');
            }
          },
        })
      );
      actionArea.appendChild(
        button({
          label: 'Hồ sơ',
          variant: 'secondary',
          size: 'sm',
          iconName: 'eye',
          onclick: () => openProfilePreview(person),
        })
      );
    }

    render(resultSlot, 
      el('div.match-banner', { 'data-reveal': 'zoom' }, [
        el('div.match-banner__icon', {}, icon('user')),
        el('div.stack-1', {}, [
          el('strong', { style: { fontSize: 'var(--text-md)' } }, 'Đã tìm thấy sinh viên'),
          el('span.caption', {}, 'Kiểm tra lại thông tin trước khi gửi lời mời kết bạn.'),
        ]),
      ]),
      el('div.friend-card.mt-4', { class: 'storefront' }, [
        el('div.friend-card__avatar', {}, avatar({ user: person, size: 'xl', presence: true })),
        el('span.friend-card__name', {}, person.fullName),
        el('div.friend-card__meta', {}, [
          el('span.friend-card__id', {}, person.studentId),
          el('span', {}, person.role),
        ]),
        el('span.friend-card__meta', {}, `${person.className} · ${person.cohort}`),
        el('span.friend-card__bio', {}, person.bio || 'Chưa có giới thiệu.'),
        el('div.row-2.row-wrap', { style: { justifyContent: 'center' } }, [
          badge({ label: person.faculty, variant: 'primary', iconName: 'building' }),
          person.mutualCount > 0
            ? badge({ label: `${person.mutualCount} bạn chung`, variant: 'violet', iconName: 'users' })
            : null,
        ]),
        actionArea,
      ])
    );

    import('../utils/motion.js').then(({ revealNow }) => revealNow(resultSlot));
  }

  async function openProfilePreview(person) {
    const { modal } = await import('../components/overlay.js');
    modal({
      title: person.fullName,
      description: `${person.studentId} · ${person.className}`,
      size: 'sm',
      body: [
        el('div.row-4', { style: { justifyContent: 'center' } }, [
          avatar({ user: person, size: 'xl' }),
          el('div.stack-2', {}, [
            el('p.bio-text', {}, person.bio || 'Chưa có giới thiệu.'),
          ]),
        ]),
        el('div.info-grid', {}, [
          infoRow('Khoa', person.faculty, 'building'),
          infoRow('Ngành', person.major, 'book'),
          infoRow('Niên khóa', person.cohort, 'graduation'),
          infoRow('Trạng thái', person.presence === 'online' ? 'Đang hoạt động' : 'Không hoạt động', 'wifi'),
        ]),
      ],
      footer: [
        button({
          label: 'Nhắn tin',
          variant: 'secondary',
          iconName: 'messages',
          onclick: () => (window.location.hash = `/chat?to=${person.studentId}`),
        }),
        button({
          label: 'Gửi lời mời',
          iconName: 'user',
          onclick: async () => {
            await friendsApi.request({ studentId: person.studentId });
            toast({ title: 'Đã gửi lời mời kết bạn', variant: 'success' });
            await reload();
          },
        }),
      ],
    });
  }

  function infoRow(label, value, iconName) {
    return el('div.info-item', {}, [
      el('div.info-item__label', {}, [
        el('span', { style: { display: 'inline-flex' } }, icon(iconName)),
        el('span', {}, label),
      ]),
      el('span.info-item__value', {}, value),
    ]);
  }

  /* ---------- Requests & lists ---------- */
  function drawRequests() {
    if (!state.incoming.length && !state.outgoing.length) {
      render(requestSlot, 
        emptyState({
          iconName: 'users',
          title: 'Không có lời mời nào đang chờ',
          message: 'Khi có sinh viên gửi lời mời kết bạn, bạn sẽ thấy chúng ở đây.',
        })
      );
      return;
    }

    render(requestSlot, 
      state.incoming.length
        ? el('div.stack-2', {}, [
            el('span.overline', {}, `Lời mời đến (${state.incoming.length})`),
            ...state.incoming.map((person) => requestRow(person, 'incoming')),
          ])
        : null,
      state.outgoing.length
        ? el('div.stack-2.mt-4', {}, [
            el('span.overline', {}, `Đang gửi (${state.outgoing.length})`),
            ...state.outgoing.map((person) => requestRow(person, 'outgoing')),
          ])
        : null
    );
  }

  function requestRow(person, direction) {
    return el(
      `div.request-row.request-row--${direction}`,
      { 'data-reveal': 'left' },
      [
        avatar({ user: person, size: 'lg', presence: direction === 'incoming' }),
        el('div.request-row__info', {}, [
          el('span.request-row__name', {}, person.fullName),
          el('span.request-row__meta', {}, [
            el('span.mono-id', {}, person.studentId),
            el('span', {}, ' · '),
            el('span', {}, `${person.className} · ${person.faculty}`),
          ]),
          el('span.caption.clamp-1', {}, person.bio || 'Chưa có giới thiệu.'),
        ]),
        direction === 'incoming'
          ? el('div.request-row__actions', {}, [
              button({
                label: 'Chấp nhận',
                variant: 'primary',
                size: 'sm',
                iconName: 'check',
                onclick: async (event) => {
                  const btn = event.currentTarget;
                  btn.classList.add('btn--loading');
                  try {
                    const detail = await findFriendshipId(person.id);
                    if (!detail) {
                      toast({ title: 'Không tìm thấy lời mời', variant: 'error' });
                      return;
                    }
                    await friendsApi.accept({ friendshipId: detail });
                    toast({ title: `Đã kết bạn với ${person.fullName}`, variant: 'success' });
                    await reload();
                  } catch (error) {
                    toast({ title: 'Không xử lý được', message: error.message, variant: 'error' });
                    btn.classList.remove('btn--loading');
                  }
                },
              }),
              button({
                label: 'Từ chối',
                variant: 'ghost',
                size: 'sm',
                iconName: 'close',
                onclick: async () => {
                  const detail = await findFriendshipId(person.id);
                  if (detail) await friendsApi.decline({ friendshipId: detail });
                  toast({ title: 'Đã từ chối lời mời', variant: 'info' });
                  await reload();
                },
              }),
            ])
          : el('span.request-row__status', {}, [
              icon('clock'),
              el('span', {}, 'Đang chờ phản hồi'),
            ]),
      ]
    );
  }

  /** Resolve a friendship id by searching the target student's relation. */
  async function findFriendshipId(targetId) {
    try {
      const relation = await friendsApi.search({ studentId: state.incoming.find((p) => p.id === targetId)?.studentId });
      return relation?.friendshipId ?? null;
    } catch {
      return null;
    }
  }

  function drawAccepted() {
    if (!state.accepted.length) {
      render(acceptedSlot, emptyState({
        iconName: 'users',
        title: 'Chưa có bạn bè nào',
        message: 'Nhập mã sinh viên ở trên để tìm và kết nối với bạn bè của bạn.',
        action: button({
          label: 'Cuộn lên để tìm bạn',
          variant: 'soft',
          size: 'sm',
          iconName: 'search',
          onclick: () =>
            document.querySelector('.student-id-input input')?.focus(),
        }),
      }));
      return;
    }

    render(
      acceptedSlot,
      el(
        'div.grid.grid-auto',
        { style: { padding: 'var(--space-4)' } },
        state.accepted.map((person, index) =>
          el(
            'div.friend-card',
            { 'data-reveal': 'zoom', style: { '--reveal-delay': `${index * 55}ms` } },
            [
              el('div.friend-card__avatar', {}, avatar({ user: person, size: 'lg', presence: true })),
              el('span.friend-card__name', {}, person.fullName),
              el(
                'button.friend-card__id',
                {
                  type: 'button',
                  title: 'Sao chép mã sinh viên',
                  onclick: () => {
                    navigator.clipboard?.writeText(person.studentId);
                    toast({ title: 'Đã sao chép', message: person.studentId, variant: 'success' });
                  },
                },
                person.studentId
              ),
              el('span.friend-card__bio', {}, person.bio || 'Chưa có giới thiệu.'),
              el('div.row-2.row-wrap', { style: { justifyContent: 'center' } }, [
                badge({ label: person.className, variant: 'neutral' }),
              ]),
              el('div.friend-card__actions', {}, [
                button({
                  label: 'Nhắn tin',
                  variant: 'soft',
                  size: 'sm',
                  iconName: 'messages',
                  onclick: () => (window.location.hash = `/chat?to=${person.studentId}`),
                }),
                button({
                  label: '',
                  variant: 'ghost',
                  size: 'sm',
                  iconOnly: true,
                  iconName: 'more',
                  ariaLabel: 'Tuỳ chọn',
                  onclick: (event) => openFriendMenu(event.currentTarget, person),
                }),
              ]),
            ]
          )
        )
      )
    );
  }

  async function openFriendMenu(anchor, person) {
    const { openMenu } = await import('../components/menu.js');
    const { confirmDialog } = await import('../components/overlay.js');

    openMenu({
      anchor,
      align: 'end',
      items: [
        { label: 'Xem hồ sơ', iconName: 'eye', onSelect: () => openProfilePreview(person) },
        { label: 'Nhắn tin', iconName: 'messages', onSelect: () => (window.location.hash = `/chat?to=${person.studentId}`) },
        { type: 'separator' },
        {
          label: 'Huỷ kết bạn',
          iconName: 'userMinus',
          danger: true,
          onSelect: () =>
            confirmDialog({
              title: 'Huỷ kết bạn?',
              message: `Bạn sẽ mất liên kết với ${person.fullName}.`,
              confirmLabel: 'Huỷ kết bạn',
              onConfirm: async () => {
                await friendsApi.remove({ studentId: person.studentId });
                toast({ title: 'Đã huỷ kết bạn', variant: 'info' });
                await reload();
              },
            }),
        },
      ],
    });
  }

  function drawSuggestions() {
    if (!state.suggestions.length) {
      render(suggestionSlot, el('span.caption', {}, 'Bạn đã kết nối với tất cả sinh viên trong hệ thống.'));
      return;
    }

    render(suggestionSlot, 
      ...state.suggestions.map((person, index) =>
        el(
          'div.friend-card',
          { 'data-reveal': 'zoom', style: { '--reveal-delay': `${index * 55}ms` } },
          [
            el('div.friend-card__avatar', {}, avatar({ user: person, size: 'lg' })),
            el('span.friend-card__name', {}, person.fullName),
            el('span.friend-card__meta', {}, `${person.className} · ${person.faculty}`),
            el('span.friend-card__bio', {}, person.bio || 'Chưa có giới thiệu.'),
            el('div.friend-card__actions', {}, [
              button({
                label: 'Kết bạn',
                variant: 'soft',
                size: 'sm',
                iconName: 'user',
                onclick: async () => {
                  try {
                    await friendsApi.request({ studentId: person.studentId });
                    toast({ title: `Đã gửi lời mời tới ${person.fullName}`, variant: 'success' });
                    await reload();
                  } catch (error) {
                    toast({ title: 'Không gửi được', message: error.message, variant: 'error' });
                  }
                },
              }),
            ]),
          ]
        )
      )
    );
  }

  async function reload() {
    try {
      state = await friendsApi.list();
    } catch (error) {
      console.error(error);
    }
    drawRequests();
    drawAccepted();
    drawSuggestions();
  }

  /* ---------- Assemble ---------- */
  const view = el('div.page', {}, [
    pageHeader({
      eyebrow: 'Cộng đồng',
      eyebrowIcon: 'users',
      title: 'Tìm bạn bè',
      subtitle: 'Kết nối với bạn cùng trường bằng mã sinh viên duy nhất của mỗi người.',
    }),
    console,
    resultSlot,
    el('div.split', {}, [
      el('div.stack-5', {}, [
        panel({ title: 'Bạn bè', titleIcon: 'users', body: acceptedSlot, flush: true }),
        panel({
          title: 'Gợi ý kết bạn',
          titleIcon: 'sparkle',
          body: suggestionSlot,
        }),
      ]),
      el('aside.sticky-aside', {}, [
        panel({ title: 'Lời mời kết bạn', titleIcon: 'inbox', body: requestSlot }),
        panel({
          title: 'Về mạng lưới UTC',
          titleIcon: 'info',
          body: el('div.stack-3', {}, [
            el('p.body-text', {},
              'Mỗi sinh viên UTC có một mã 10 chữ số duy nhất. Bạn chỉ cần mã đó để tìm bất kỳ ai — không cần tra cứu danh bạ hay mạng xã hội.'),
            el('div.divider'),
            el('div.stack-2', {}, [
              bulletRow('Mã sinh viên là duy nhất', 'check'),
              bulletRow('Bạn có thể hủy lời mời bất cứ lúc nào', 'check'),
              bulletRow('Chỉ bạn mới chỉnh sửa được hồ sơ của mình', 'check'),
            ]),
          ]),
        }),
      ]),
    ]),
  ]);

  render(outlet, view);
  await reload();
  import('../utils/motion.js').then(({ enhance }) => enhance(view));

  function bulletRow(text, iconName) {
    return el('div.row-2', { style: { alignItems: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' } }, [
      el('span', { style: { display: 'inline-flex', color: 'var(--success)', marginTop: '1px' } }, icon(iconName)),
      el('span', {}, text),
    ]);
  }
}
