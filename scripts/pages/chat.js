/**
 * Chat
 *
 * Structure is deliberately split so new message kinds can be added without
 * touching this file's layout logic:
 *   • data shape + validation → features/chat/attachmentRegistry.js
 *   • visual contract per kind → styles/features/chat.css (`.attach--*`)
 *   • composer affordances     → `COMPOSER_TOOLS` in the registry
 *
 * This file owns only conversation state, streaming the thread, and the
 * composer wiring.
 */

import { el, $, render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { button, avatar, avatarStack, badge, emptyState, iconTile } from '../components/ui.js';
import { searchInput } from '../components/forms.js';
import { pageHeader } from '../components/page.js';
import { chatApi } from '../core/api.js';
import { toast, uiStore, refreshUnread } from '../core/app-store.js';
import { dayLabel, formatTime, timeAgo, formatBytes } from '../utils/format.js';
import {
  COMPOSER_TOOLS,
  COMPOSER_ORDER,
  renderAttachments,
  validateAttachments,
} from '../features/chat/attachmentRegistry.js';
import * as realtime from '../api/realtime-client.js';

/** @param {HTMLElement} outlet @param {{search: object}} ctx */
export async function chatPage(ctx) {
  const outlet = ctx.outlet;

  const state = {
    conversations: [],
    activeId: null,
    messages: [],
    query: '',
    view: 'list',
    // Per-conversation drafts, so switching threads (or a live message
    // arriving) never throws away what was being typed.
    drafts: {},
  };

  /** Mounted thread parts; see drawThread(). */
  let threadParts = null;

  const listNode = el('div.chat__list');
  const threadNode = el('div.chat__thread');
  const layout = el('div.chat', { 'data-view': 'list' }, [listNode, threadNode]);

  /* ---------- Header ---------- */
  const view = el('div.page', { style: { gap: 'var(--space-4)' } }, [
    el('div.row-between.row-wrap', { 'data-reveal': '' }, [
      el('div.page__heading', {}, [
        el('span.page__eyebrow', {}, [icon('messages'), el('span', {}, 'Cộng đồng')]),
        el('h1.page-title', {}, 'Tin nhắn'),
        el('p.body-text', {}, 'Trò chuyện cá nhân và nhóm. Gửi tin nhắn, hình ảnh và tài liệu — tất cả cập nhật ngay khi người nhận mở trang.'),
      ]),
      el('div.page__actions', {}, [
        button({
          label: 'Tạo nhóm chat',
          iconName: 'plus',
          onclick: openCreateGroup,
        }),
      ]),
    ]),
    layout,
  ]);

  render(outlet, view);

  /* ================= Realtime ================= */

  /**
   * Live updates from the server.
   *
   * Every handler is written to be idempotent: an event that arrives for a
   * conversation the user is not viewing updates only the list, and one for the
   * open conversation appends the message. A duplicated delivery (a reconnect
   * replay, say) is filtered by id rather than assumed impossible.
   */
  const unsubscribers = [
    realtime.on(realtime.REALTIME_EVENTS.CHAT_MESSAGE, async (message) => {
      if (!message?.conversationId) return;

      const isOpen = state.activeId === message.conversationId;

      if (isOpen) {
        // Idempotent: a reconnect can replay the last delivery.
        if (state.messages.some((m) => m.id === message.id)) return;

        state.messages.push(message);
        // `drawThread` decides whether to stick to the bottom from the scroll
        // position that was current *before* the repaint. Scrolling here first
        // would always force the reader back down, even when scrolling history.
        drawThread(currentConversation());

        // Someone else's message: clear it here rather than waiting for the
        // peer to notice, so the badge does not linger on an open thread.
        if (!message.isOwn) {
          chatApi.markRead(message.conversationId)
            .then(() => refreshUnread())
            .catch(() => {});
        }
      }

      /**
       * Refresh the list for the preview and the unread badge.
       *
       * `keepThread` stops this from reloading `state.messages` — the open
       * thread was just updated in place, and letting it pick the first
       * conversation would leave the user reading another one's history.
       */
      await loadConversations({ keepThread: true });
    }),

    /**
     * The socket came back after an outage.
     *
     * Anything sent while it was down was never pushed, so the open thread is
     * refetched. This is what makes a dropped connection invisible to the user
     * instead of leaving a silent gap in their conversation.
     */
    realtime.on(realtime.RECONNECTED, async () => {
      await loadConversations();
      if (state.activeId) {
        await chatApi.markRead(state.activeId).catch(() => {});
      }
    }),

    realtime.on(realtime.REALTIME_EVENTS.CHAT_TYPING, ({ conversationId, typing }) => {
      if (conversationId !== state.activeId || !state.activeId) return;
      state.typing = typing ? conversationId : null;
      drawThread(currentConversation());
    }),

    realtime.on(realtime.REALTIME_EVENTS.CHAT_READ, ({ conversationId, ids }) => {
      if (conversationId !== state.activeId || !state.activeId) return;
      const read = new Set(ids ?? []);
      state.messages = state.messages.map((m) => (read.has(m.id) ? { ...m, status: 'read' } : m));
      drawThread(currentConversation());
    }),

    realtime.on(realtime.REALTIME_EVENTS.CHAT_CONVERSATION, async ({ conversation }) => {
      if (!conversation) return;
      if (state.conversations.some((c) => c.id === conversation.id)) return;
      await loadConversations();
    }),
  ];

  /** The conversation currently open, or null when only the list is shown. */
  function currentConversation() {
    if (!state.activeId) return null;
    return state.conversations.find((c) => c.id === state.activeId) ?? null;
  }

  /** Detach every listener when the page is replaced. */
  function teardown() {
    for (const off of unsubscribers) off();
    unsubscribers.length = 0;
    // Leaving the page means no thread is on screen, so a new message must
    // notify again.
    uiStore.setState({ activeConversationId: null });
  }

  /* ================= Conversation list ================= */

  /**
   * Refresh the conversation list.
   *
   * `keepThread` matters: a realtime update for a conversation the user is not
   * looking at must refresh only the list. Without it this would pick the first
   * conversation, load *its* messages into `state.messages`, and leave the open
   * thread showing another conversation's history.
   */
  async function loadConversations({ keepThread = false } = {}) {
    state.conversations = await chatApi.list();

    // Notification links carry the conversation id (`?c=`), which is stable
    // even though the notice was written by another account.
    const targetConversationId = ctx.search?.c;
    if (targetConversationId && state.conversations.some((c) => c.id === targetConversationId)) {
      state.activeId = targetConversationId;
      state.view = 'thread';
    }

    // Honour ?to=MSV from the friends page
    const targetId = ctx.search?.to;
    if (targetId && !state.activeId) {
      try {
        const { users } = await import('../core/api.js');
        const person = await users.getByStudentId(targetId);
        const conversation = await chatApi.openDirect(person.id);
        state.activeId = conversation.id;
        state.view = 'thread';
      } catch {
        toast({ title: 'Không mở được cuộc trò chuyện', variant: 'warn' });
      }
    }

    if (!state.activeId && state.conversations.length) {
      state.activeId = state.conversations[0].id;
    }

    drawList();

    if (keepThread) return;
    if (state.activeId) await loadMessages();
    else drawThreadEmpty();
  }

  /**
   * Created once, outside drawList().
   *
   * Rebuilding the field on every repaint (a live message triggers one) put
   * the caret back at the start after each keystroke, so a query could never
   * be typed. The list head and body are still rebuilt, but the input itself
   * stays mounted.
   */
  const listSearch = searchInput({
    placeholder: 'Tìm cuộc trò chuyện…',
    onInput: (value) => {
      state.query = value.toLowerCase();
      drawList();
    },
  });
  const listSearchSlot = el('div.chat__list-search', {}, listSearch.node);
  const listBody = el('div.chat__list-body');
  let listHead = null;

  function drawList() {
    const groups = { direct: [], group: [] };
    state.conversations.forEach((conversation) => {
      groups[conversation.type].push(conversation);
    });

    const head = el('header.chat__list-head', {}, [
      el('div.stack', { style: { gap: 0 } }, [
        el('strong', { style: { fontSize: 'var(--text-sm)' } }, 'Hộp thư'),
        el('span.caption', {}, `${state.conversations.length} cuộc trò chuyện`),
      ]),
      el('button.quick-action', {
        type: 'button',
        'aria-label': 'Tạo nhóm mới',
        title: 'Tạo nhóm chat',
        onclick: openCreateGroup,
      }, icon('plus')),
    ]);

    if (!listHead) {
      render(listNode, head, listSearchSlot, listBody);
    } else {
      listHead.replaceWith(head);
    }
    listHead = head;

    listBody.replaceChildren();

    const filter = (items) =>
      state.query
        ? items.filter((c) => c.title.toLowerCase().includes(state.query))
        : items;

    const direct = filter(groups.direct);
    const group = filter(groups.group);

    if (!direct.length && !group.length) {
      listBody.appendChild(
        emptyState({
          iconName: 'messages',
          title: state.query ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện',
          message: state.query
            ? 'Thử một từ khoá khác.'
            : 'Tìm bạn bè để bắt đầu cuộc trò chuyện đầu tiên.',
          action: state.query
            ? null
            : button({
                label: 'Tìm bạn bè',
                variant: 'soft',
                size: 'sm',
                iconName: 'users',
                onclick: () => (window.location.hash = '/friends'),
              }),
        })
      );
    }

    if (direct.length) {
      listBody.appendChild(el('p.chat__section-label', {}, 'Trò chuyện'));
      direct.forEach((conversation) => listBody.appendChild(conversationRow(conversation)));
    }

    if (group.length) {
      listBody.appendChild(el('p.chat__section-label', {}, 'Nhóm'));
      group.forEach((conversation) => listBody.appendChild(conversationRow(conversation)));
    }
  }

  function conversationRow(conversation) {
    const peer = conversation.peer;
    const last = conversation.lastMessage;

    const preview =
      conversation.type === 'group' && last?.isOwn ? 'Bạn: ' : '';

    return el(
      'button.conv',
      {
        type: 'button',
        class: conversation.id === state.activeId ? 'is-active' : '',
        onclick: () => selectConversation(conversation.id),
      },
      [
        peer
          ? avatar({ user: peer, size: 'lg', presence: true })
          : el('span.avatar.avatar--lg.avatar--group', {}, icon('users')),
        el('div.conv__body', {}, [
          el('div.conv__top', {}, [
            el('span.conv__name', {}, conversation.title),
            el('span.conv__time', {}, last ? timeAgo(last.createdAt) : ''),
          ]),
          el('span.conv__preview', {},
            `${preview}${last ? last.text || 'Tệp đính kèm' : 'Chưa có tin nhắn'}`),
        ]),
        conversation.unread > 0
          ? el('span.conv__unread', {}, conversation.unread > 99 ? '99+' : String(conversation.unread))
          : null,
      ]
    );
  }

  async function selectConversation(id) {
    state.activeId = id;
    state.view = 'thread';
    layout.dataset.view = 'thread';
    drawList();
    await loadMessages();
  }

  function backToList() {
    state.view = 'list';
    layout.dataset.view = 'list';
    uiStore.setState({ activeConversationId: null });
  }

  /* ================= Thread ================= */

  async function loadMessages() {
    const conversation = state.conversations.find((c) => c.id === state.activeId);
    if (!conversation) return;

    try {
      state.messages = await chatApi.messages(state.activeId);
      await chatApi.markRead(state.activeId);
      // Keep the sidebar badge in sync
      const updated = state.conversations.find((c) => c.id === state.activeId);
      if (updated) updated.unread = 0;
      drawList();
    } catch (error) {
      console.error(error);
      toast({ title: 'Không tải được tin nhắn', message: error.message, variant: 'error' });
    }

    // Reading a thread clears its notices on the server; pull the new two
    // counters so the bell and the sidebar agree immediately.
    uiStore.setState({ activeConversationId: state.activeId });
    refreshUnread();

    drawThread(conversation);
  }

  /**
   * Render the open thread.
   *
   * Header, message stream and composer are separate parts: a live message or
   * a read receipt only repaints the stream, so whatever is being typed
   * survives. Only switching conversation rebuilds the composer, and it is
   * rebuilt from that conversation's saved draft.
   */
  function drawThread(conversation) {
    if (!conversation) return drawThreadEmpty();

    if (!threadParts || threadParts.conversationId !== conversation.id) {
      threadParts = {
        conversationId: conversation.id,
        head: threadHeader(conversation),
        stream: el('div.chat__messages', { id: 'chat-stream' }),
        composer: composerNode(conversation),
      };
      render(threadNode, threadParts.head, threadParts.stream, threadParts.composer);
      renderMessages(conversation, { stick: true });
      return;
    }

    const head = threadHeader(conversation);
    threadParts.head.replaceWith(head);
    threadParts.head = head;

    renderMessages(conversation, { stick: isNearBottom(threadParts.stream) });
  }

  /** True when the reader is following the conversation, not reading back. */
  function isNearBottom(node) {
    return node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }

  /** Repaint only the messages; the composer above stays mounted. */
  function renderMessages(conversation, { stick = true } = {}) {
    const stream = threadParts.stream;
    stream.replaceChildren();

    if (!state.messages.length) {
      stream.appendChild(
        emptyState({
          iconName: 'messages',
          title: 'Chưa có tin nhắn nào',
          message: conversation.type === 'group'
            ? 'Chào mừng thành viên đầu tiên của nhóm tới với cuộc trò chuyện.'
            : 'Hãy gửi lời chào đầu tiên của bạn.',
        })
      );
      return;
    }

    let lastSenderId = null;
    let lastBucket = null;

    state.messages.forEach((message, index) => {
      const bucket = dayBucket(message.createdAt);

      if (bucket !== lastBucket) {
        stream.appendChild(el('div.day-sep', {}, el('span.day-sep__label', {}, bucket)));
        lastBucket = bucket;
        lastSenderId = null;
      }

      const tight = message.senderId === lastSenderId && !message.type;
      lastSenderId = message.senderId;

      stream.appendChild(messageNode(message, conversation, tight, index));
    });

    /**
     * A live message repaints the whole stream, so the rows must appear at once.
     * Leaving them to the reveal observer would blank every bubble (or replay
     * the whole stagger) on each incoming message — the thread visibly reloads.
     */
    stream.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((node) => {
      node.classList.add('is-revealed');
    });

    if (stick) scrollToBottom(stream);
  }

  function dayBucket(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(date, today)) return 'Hôm nay';
    if (same(date, yesterday)) return 'Hôm qua';
    return dayLabel(date);
  }

  function messageNode(message, conversation, tight, index) {
    if (message.type === 'system') {
      return el('div.msg.msg--system', { 'data-reveal': '' }, [
        el('div.bubble', {}, message.text),
      ]);
    }

    const own = message.isOwn;
    const showAuthor = !own && conversation.type === 'group' && !tight;

    const bubbleChildren = [
      message.text ? el('div', {}, message.text) : null,
      renderAttachments(message.attachments ?? []),
    ].filter(Boolean);

    const node = el(
      'div',
      {
        class: [
          'msg',
          own ? 'msg--own' : '',
          tight ? 'msg--tight' : '',
        ]
          .filter(Boolean)
          .join(' '),
        'data-reveal': '',
        style: { '--reveal-delay': `${Math.min(index * 18, 220)}ms` },
      },
      [
        own || tight ? null : avatar({ user: message.sender, size: 'xs' }),
        el('div.msg__col', {}, [
          showAuthor
            ? el('div.msg__meta', {}, [
                el('span.msg__author', { style: { '--author-color': message.senderColor } }, message.sender?.fullName ?? ''),
                el('span.msg__time', {}, formatTime(message.createdAt)),
              ])
            : null,
          el('div.bubble', { class: own ? 'bubble--own' : '' }, bubbleChildren),
          own
            ? el('div.msg__status', { class: message.status === 'read' ? 'msg__status--read' : '' }, [
                icon(message.status === 'read' ? 'checkCheck' : 'check'),
                el('span', {}, message.status === 'read' ? 'Đã xem' : 'Đã gửi'),
              ])
            : null,
        ]),
      ]
    );

    /**
     * Resolve image bytes after the row is on screen.
     *
     * The row renders immediately with the name and size; the picture arrives
     * once its blob has been fetched. Doing it the other way round would block
     * the whole thread on one slow image.
     */
    for (const attachment of message.attachments ?? []) {
      if (attachment.kind !== 'image' || attachment.payload?.objectUrl) continue;
      hydrateAttachment(attachment, node);
    }

    return node;
  }

  /** Fetch an image's bytes and paint it into an already-rendered row. */
  async function hydrateAttachment(attachment, node) {
    await chatApi.ensureAttachment(attachment);

    const src = attachment.payload?.objectUrl;
    if (!src) return;

    const img = node.querySelector(`.attach--image [data-attachment="${attachment.id}"]`);
    if (!img) return;

    img.src = src;
    img.style.opacity = '';
  }

  function threadHeader(conversation) {
    const peer = conversation.peer;

    return el('header.chat__head', {}, [
      el('button.quick-action.chat__back', {
        type: 'button',
        'aria-label': 'Quay lại danh sách',
        onclick: backToList,
      }, icon('arrowLeft')),
      peer
        ? avatar({ user: peer, size: 'md', presence: true })
        : el('span.avatar.avatar--md.avatar--group', {}, icon('users')),
      el('div.chat__head-info', {}, [
        el('span.chat__head-name', {}, conversation.title),
        el(
          'span.chat__head-status',
          { class: peer?.presence === 'online' ? 'chat__head-status--online' : '' },
          [
            el('span', {}, peer
              ? (peer.presence === 'online' ? 'Đang hoạt động' : 'Không hoạt động')
              : `${conversation.members.length} thành viên`),
          ]
        ),
      ]),
      el('div.chat__head-actions', {}, [
        conversation.type === 'group'
          ? el('button.quick-action', {
              type: 'button',
              'aria-label': 'Thành viên nhóm',
              title: 'Thành viên nhóm',
              onclick: () => openGroupInfo(conversation),
            }, icon('users'))
          : null,
        el('button.quick-action', {
          type: 'button',
          'aria-label': 'Tìm trong cuộc trò chuyện',
          title: 'Tìm trong cuộc trò chuyện',
          onclick: () => toast({ title: 'Tính năng đang phát triển', variant: 'info' }),
        }, icon('search')),
        el('button.quick-action', {
          type: 'button',
          'aria-label': 'Tuỳ chọn',
          title: 'Tuỳ chọn',
          onclick: (event) => openThreadMenu(event.currentTarget, conversation),
        }, icon('more')),
      ]),
    ]);
  }

  async function openThreadMenu(anchor, conversation) {
    const { openMenu } = await import('../components/menu.js');
    openMenu({
      anchor,
      items: [
        { label: 'Xem thông tin', iconName: 'info', onSelect: () => openGroupInfo(conversation) },
        {
          label: 'Đánh dấu đã đọc',
          iconName: 'checkCheck',
          onSelect: async () => {
            await chatApi.markRead(conversation.id);
            toast({ title: 'Đã đánh dấu đã đọc', variant: 'success' });
          },
        },
        { type: 'separator' },
        {
          label: 'Rời khỏi cuộc trò chuyện',
          iconName: 'logout',
          danger: true,
          onSelect: () =>
            toast({
              title: 'Tính năng đang phát triển',
              message: 'Sẽ khả dụng khi có backend quản lý thành viên.',
              variant: 'warn',
            }),
        },
      ],
    });
  }

  async function openGroupInfo(conversation) {
    const { modal } = await import('../components/overlay.js');

    modal({
      title: conversation.title,
      description: `${conversation.members.length} thành viên · ${conversation.messageCount} tin nhắn`,
      size: 'sm',
      body: [
        el('div.stack-2', {}, conversation.members.map((member) =>
          el('div.list-row', {}, [
            avatar({ user: member, size: 'md', presence: true }),
            el('div.grow', { style: { minWidth: 0 } }, [
              el('div.truncate', { style: { fontWeight: 600, fontSize: 'var(--text-sm)' } }, member.fullName),
              el('span.caption', {}, `${member.className} · ${member.studentId}`),
            ]),
            button({
              label: 'Nhắn',
              variant: 'ghost',
              size: 'xs',
              iconName: 'messages',
              onclick: async () => {
                const direct = await chatApi.openDirect(member.id);
                state.activeId = direct.id;
                await loadConversations();
              },
            }),
          ])
        )),
      ],
    });
  }

  /* ================= Composer ================= */

  function composerNode(conversation) {
    const draft = state.drafts[conversation.id]
      ?? (state.drafts[conversation.id] = { text: '', staged: [] });

    const input = el('textarea.composer__input', {
      name: 'message-body',
      placeholder: conversation.type === 'group'
        ? `Nhắn vào ${conversation.title}…`
        : `Nhắn cho ${conversation.title}…`,
      rows: 1,
      'aria-label': 'Nội dung tin nhắn',
      maxlength: '4000',
    });
    input.value = draft.text ?? '';

    // Auto-grow
    const resize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
    };
    input.addEventListener('input', () => {
      draft.text = input.value;
      resize();
    });

    const sendBtn = el(
      'button.composer__send',
      {
        type: 'button',
        'aria-label': 'Gửi tin nhắn',
        title: 'Gửi (Enter)',
        disabled: true,
        onclick: send,
      },
      icon('send')
    );

    const updateSendState = () => {
      sendBtn.disabled = input.value.trim().length === 0;
    };
    input.addEventListener('input', updateSendState);

    // Enter sends, Shift+Enter adds a newline
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });

    async function send() {
      const text = input.value.trim();
      const staged = draft.staged;

      if (!text && !staged.length) return;

      sendBtn.disabled = true;

      try {
        // Files are uploaded first, then the message references the ids it
        // gets back. Sending them together would mean a failed upload leaving
        // a message that references nothing.
        const uploaded = [];
        for (const item of staged) {
          const saved = await chatApi.uploadAttachment(conversation.id, item.file);
          uploaded.push(toAttachment(saved));
        }

        const message = await chatApi.send(conversation.id, { text, attachments: uploaded });
        // The socket event can beat the HTTP response; appending blindly would
        // then show the same bubble twice.
        if (!state.messages.some((m) => m.id === message.id)) state.messages.push(message);
        draft.text = '';
        draft.staged = [];
        pendingSlot.replaceChildren();

        await refreshConversationMeta(conversation.id);
        drawThread(conversation);

        input.value = '';
        syncSendButton();
        requestAnimationFrame(() => {
          const stream = threadNode.querySelector('.chat__messages');
          stream?.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
        });
      } catch (error) {
        toast({ title: 'Gửi không thành công', message: error.message, variant: 'error' });
        sendBtn.disabled = false;
      }
    }

    /** Enable send only when there is something to send. */
    function syncSendButton() {
      const has = input.value.trim() || draft.staged.length;
      sendBtn.disabled = !has;
    }

    /** Build a registry attachment from a server response. */
    function toAttachment(saved) {
      return {
        id: saved.id,
        kind: saved.kind === 'image' ? 'image' : 'file',
        payload: {
          url: saved.url,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          size: saved.size,
        },
      };
    }

    /* --- Staged files, shown above the input --- */
    const pendingSlot = el('div.composer__pending');

    function drawPending() {
      const staged = draft.staged;
      if (!staged.length) {
        pendingSlot.replaceChildren();
        return;
      }

      pendingSlot.replaceChildren(
        ...staged.map((item, index) =>
          el('span.composer__chip', {}, [
            icon(item.file.type?.startsWith('image/') ? 'image' : 'file'),
            el('span', {}, item.file.name),
            el('button.composer__chip-x', {
              type: 'button',
              'aria-label': `Bỏ ${item.file.name}`,
              onclick: () => {
                draft.staged.splice(index, 1);
                drawPending();
                syncSendButton();
              },
            }, icon('close')),
          ])
        )
      );
    }

    /** Open the picker and stage whatever comes back. */
    function pickFiles(kind, accept) {
      const picker = el('input', { type: 'file', accept, style: { display: 'none' } });

      picker.onchange = async () => {
        const files = [...(picker.files ?? [])];
        picker.remove();
        if (!files.length) return;

        // 6 is what the server keeps per message; staging more would silently
        // drop the extras.
        draft.staged = [...draft.staged, ...files].slice(0, 6);
        drawPending();
        syncSendButton();
      };

      document.body.append(picker);
      picker.click();
    }

    /* --- Attachment toolbar, driven entirely by the registry --- */
    const tools = el('div.composer__tools', {}, COMPOSER_ORDER.map((key) => {
      const tool = COMPOSER_TOOLS[key];

      const onClick = {
        image: () => pickFiles('image', 'image/png,image/jpeg,image/webp,image/gif'),
        file: () => pickFiles('file', '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'),
        emoji: () => insertEmoji(input),
      }[key];

      return el(
        'button.composer__tool',
        {
          type: 'button',
          'aria-label': tool.label,
          title: tool.label,
          onclick: onClick,
        },
        icon(tool.iconName)
      );
    }));

    drawPending();
    requestAnimationFrame(() => {
      resize();
      syncSendButton();
    });

    return el('div.composer', {}, [
      pendingSlot,
      el('div.composer__box', {}, [tools, input, sendBtn]),
      el('div.composer__footer', {}, [
        el('span.composer__hint', {}, [
          el('kbd', {}, 'Enter'),
          ' để gửi · ',
          el('kbd', {}, 'Shift'),
          ' + ',
          el('kbd', {}, 'Enter'),
          ' để xuống dòng',
        ]),
      ]),
    ]);
  }

  /** Insert an emoji at the caret, not at the end. */
  function insertEmoji(field) {
    const EMOJI = ['😀', '😂', '😅', '😊', '😍', '🤔', '👍', '🙏', '🎉', '❤️'];
    const chosen = EMOJI[Math.floor(Math.random() * EMOJI.length)];

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;

    field.value = field.value.slice(0, start) + chosen + field.value.slice(end);
    field.focus();
    field.setSelectionRange(start + chosen.length, start + chosen.length);

    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function refreshConversationMeta(conversationId) {
    try {
      state.conversations = await chatApi.list();
      drawList();
    } catch {
      /* non-critical */
    }
  }

  /* ================= Helpers ================= */

  function scrollToBottom(stream) {
    if (!stream) return;
    requestAnimationFrame(() => {
      stream.scrollTop = stream.scrollHeight;
    });
  }

  function drawThreadEmpty() {
    threadParts = null;
    render(threadNode, 
      el('div.chat__head', {}, [
        el('div.chat__head-info', {}, [el('span.chat__head-name', {}, 'Chọn một cuộc trò chuyện')]),
      ]),
      emptyState({
        iconName: 'messages',
        title: 'Chọn một cuộc trò chuyện',
        message: 'Chọn một người bạn hoặc nhóm ở danh sách bên trái để bắt đầu.',
      })
    );
  }

  /* ================= Create group ================= */

  async function openCreateGroup() {
    const { modal } = await import('../components/overlay.js');
    const { users } = await import('../core/api.js');

    const directory = await users.directory({ limit: 12, excludeIds: [] });
    const selected = new Set();

    const { textInput } = await import('../components/forms.js');

    const nameField = textInput({
      label: 'Tên nhóm',
      iconName: 'users',
      placeholder: 'VD: Nhóm ôn thi giữa kỳ',
      maxLength: 60,
      required: true,
      autofocus: true,
    });

    const selectedChips = el('div.group-selected');

    const drawChips = () => {
      render(selectedChips, 
        ...[...selected].map((id) => {
          const person = directory.find((d) => d.id === id);
          if (!person) return null;
          return el(
            'button.chip.is-active',
            {
              type: 'button',
              onclick: () => {
                selected.delete(id);
                drawChips();
                drawMembers();
              },
            },
            [
              el('span', {}, person.fullName),
              el('span.chip__x', {}, icon('close')),
            ]
          );
        })
      );
      if (!selected.size) {
        selectedChips.appendChild(el('span.caption', {}, 'Chưa chọn thành viên nào'));
      }
    };

    const memberList = el('div.group-picker', { style: { maxHeight: '18rem', overflowY: 'auto' } });

    function drawMembers() {
      render(memberList, 
        ...directory.map((person) => {
          const isSelected = selected.has(person.id);
          return el(
            'button.group-member',
            {
              type: 'button',
              class: isSelected ? 'is-selected' : '',
              onclick: () => {
                if (selected.has(person.id)) selected.delete(person.id);
                else selected.add(person.id);
                drawChips();
                drawMembers();
              },
            },
            [
              avatar({ user: person, size: 'sm', presence: true }),
              el('div.group-member__info', {}, [
                el('span.group-member__name', {}, person.fullName),
                el('span.group-member__meta', {}, `${person.className} · ${person.studentId}`),
              ]),
              el('span.group-member__check', {}, icon('check')),
            ]
          );
        })
      );
    }

    drawChips();
    drawMembers();

    const createBtn = button({
      label: 'Tạo nhóm',
      iconName: 'users',
      onclick: async () => {
        const name = nameField.input.value.trim();
        if (!name) {
          nameField.setError?.('Vui lòng nhập tên nhóm.');
          return;
        }
        if (!selected.size) {
          toast({ title: 'Hãy chọn ít nhất một thành viên', variant: 'warn' });
          return;
        }

        createBtn.classList.add('btn--loading');
        try {
          const conversation = await chatApi.createGroup({ title: name, memberIds: [...selected] });
          dialog.close();
          state.conversations = await chatApi.list();
          state.activeId = conversation.id;
          state.view = 'thread';
          layout.dataset.view = 'thread';
          await loadMessages();
          toast({ title: 'Đã tạo nhóm', message: name, variant: 'success' });
        } catch (error) {
          toast({ title: 'Không tạo được nhóm', message: error.message, variant: 'error' });
        } finally {
          createBtn.classList.remove('btn--loading');
        }
      },
    });

    const dialog = modal({
      title: 'Tạo nhóm chat',
      description: 'Chọn thành viên và đặt tên cho nhóm.',
      size: 'md',
      body: [
        nameField.node,
        el('div.stack-2', {}, [
          el('span.field__label', {}, 'Thành viên'),
          selectedChips,
        ]),
        memberList,
      ],
      footer: [
        button({ label: 'Huỷ', variant: 'ghost', onclick: () => dialog.close() }),
        createBtn,
      ],
    });
  }

  /* ================= Boot ================= */

  try {
    await loadConversations();
  } catch (error) {
    console.error(error);
    render(outlet, 
      emptyState({
        iconName: 'alert',
        title: 'Không tải được danh sách cuộc trò chuyện',
        message: error.message,
        action: button({ label: 'Thử lại', iconName: 'refresh', onclick: () => chatPage(ctx) }),
      })
    );
  }

  // The router calls this before rendering the next page. Without it, every
  // visit would leave a live subscription behind that keeps re-rendering a
  // detached node.
  return teardown;
}
