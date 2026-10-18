/**
 * Posts
 * Student feed with create, like / dislike, and comments.
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
  iconTile,
  notice,
  segmented,
} from '../components/ui.js';
import { searchInput, textInput } from '../components/forms.js';
import { pageHeader, section } from '../components/page.js';
import { postsApi } from '../core/api.js';
import { authStore, toast } from '../core/app-store.js';
import { formatCompact, formatNumber, timeAgo } from '../utils/format.js';
import { confirmDialog } from '../components/overlay.js';
import { students } from '../data/seed.js';

const COLOR_NAMES = ['brand', 'violet', 'accent', 'signal', 'success', 'danger'];

/** @param {HTMLElement} outlet */
export async function postsPage(ctx) {
  const outlet = ctx.outlet;

  const me = authStore.getState().user;
  const state = { scope: 'all', posts: [], query: '', expanded: new Set() };

  const feed = el('div.stack-4');
  const railSlot = el('aside.sticky-aside');

  /* ---------- Composer ---------- */
  const composerInput = el('textarea.composer-card__input', {
    name: 'post-body',
    placeholder: `Chuyện gì đang bận tâm, ${me?.fullName.split(' ').slice(-1)[0] ?? ''}?`,
    rows: 3,
    maxlength: '5000',
    'aria-label': 'Nội dung bài viết',
  });

  const charCount = el('span.caption');

  composerInput.addEventListener('input', () => {
    const length = composerInput.value.length;
    charCount.textContent = length ? `${formatNumber(length)}/5000` : '';
    publishBtn.disabled = composerInput.value.trim().length === 0;
  });

  const publishBtn = button({
    label: 'Đăng bài',
    iconName: 'send',
    disabled: true,
    onclick: async () => {
      const content = composerInput.value.trim();
      if (!content) return;

      publishBtn.classList.add('btn--loading');
      try {
        const post = await postsApi.create({ content });
        state.posts.unshift(post);
        composerInput.value = '';
        charCount.textContent = '';
        publishBtn.disabled = true;
        drawFeed();
        drawRail();
        toast({ title: 'Đã đăng bài', message: 'Bài viết của bạn đang hiển thị trong bảng tin.', variant: 'success' });
      } catch (error) {
        toast({ title: 'Không đăng được', message: error.message, variant: 'error' });
      } finally {
        publishBtn.classList.remove('btn--loading');
      }
    },
  });

  const composer = el('section.composer-card', { 'data-reveal': 'zoom' }, [
    el('div.composer-card__top', {}, [
      avatar({ user: me, size: 'md' }),
      el('div.composer-card__field', {}, composerInput),
    ]),
    el('div.composer-card__footer', {}, [
      el('div.composer-card__tools', {}, [
        composerTool('image', 'Thêm hình ảnh', 'Tính năng đang phát triển'),
        composerTool('smile', 'Thêm biểu tượng', 'Cảm xúc sẽ có ở phiên bản tiếp theo'),
        composerTool('tag', 'Gắn thẻ môn học', 'Gắn thẻ môn học sẽ có ở phiên bản tiếp theo'),
      ]),
      el('div.row-2', {}, [charCount, publishBtn]),
    ]),
  ]);

  function composerTool(iconName, label, message) {
    return el(
      'button.composer__tool',
      {
        type: 'button',
        'aria-label': label,
        title: label,
        onclick: () => toast({ title: label, message, variant: 'info' }),
      },
      icon(iconName)
    );
  }

  /* ---------- Filter ---------- */
  const scopeSwitch = segmented({
    items: [
      { id: 'all', label: 'Tất cả', iconName: 'layers' },
      { id: 'friends', label: 'Bạn bè', iconName: 'users' },
    ],
    active: state.scope,
    onChange: async (id) => {
      state.scope = id;
      scopeSwitch.update(id);
      await load();
    },
  });

  const search = searchInput({
    placeholder: 'Tìm trong bài đăng…',
    onInput: (value) => {
      state.query = value.toLowerCase();
      drawFeed();
    },
  });

  /* ---------- Feed ---------- */
  async function load() {
    try {
      state.posts = await postsApi.list({ scope: state.scope, limit: 40 });
    } catch (error) {
      console.error(error);
      state.posts = [];
    }
    drawFeed();
    drawRail();
  }

  function visiblePosts() {
    if (!state.query) return state.posts;
    return state.posts.filter((post) =>
      `${post.content} ${post.author?.fullName ?? ''}`.toLowerCase().includes(state.query)
    );
  }

  function drawFeed() {
    const posts = visiblePosts();

    if (!posts.length) {
      render(feed, 
        emptyState({
          iconName: 'messages',
          title: state.query ? 'Không tìm thấy bài đăng' : 'Chưa có bài đăng nào',
          message: state.query
            ? 'Thử một từ khoá khác.'
            : 'Hãy là người đầu tiên đăng bài trong nhóm sinh viên của bạn.',
        })
      );
      return;
    }

    render(feed, ...posts.map((post, index) => postCard(post, index)));
  }

  function postCard(post, index) {
    const colorName = COLOR_NAMES[(post.author?.avatarIndex ?? 0) % COLOR_NAMES.length];
    const isExpanded = state.expanded.has(post.id);
    const canDelete = post.authorId === me.id;

    const body = el(
      'div.post__body',
      {
        class: isExpanded ? '' : 'clamp-3',
        style: { cursor: isExpanded ? 'text' : 'pointer' },
        onclick: () => {
          if (isExpanded) return;
          state.expanded.add(post.id);
          body.classList.remove('clamp-3');
          toggleMore.hidden = true;
        },
      },
      post.content
    );

    const toggleMore = post.content.length > 320
      ? el(
          'button.btn.btn--link',
          {
            type: 'button',
            style: { alignSelf: 'flex-start', marginTop: 'calc(var(--space-2) * -1)' },
            onclick: () => {
              state.expanded.add(post.id);
              body.classList.remove('clamp-3');
              toggleMore.hidden = true;
            },
          },
          'Xem thêm'
        )
      : null;

    /* --- Reactions --- */
    const likeBtn = reactionButton({
      count: post.likes,
      active: post.viewerLiked,
      iconName: 'thumbsUp',
      label: 'Thích',
      tone: 'primary',
      onclick: async () => {
        const updated = await postsApi.toggleLike(post.id);
        replacePost(updated);
        likeBtn.classList.remove('heart-burst');
        void likeBtn.offsetWidth;
        likeBtn.classList.add('heart-burst');
      },
    });

    const dislikeBtn = reactionButton({
      count: post.dislikes,
      active: post.viewerDisliked,
      iconName: 'thumbsDown',
      label: 'Không thích',
      tone: 'danger',
      onclick: async () => {
        const updated = await postsApi.toggleDislike(post.id);
        replacePost(updated);
      },
    });

    const reactions = el('div.reactions', {}, [
      likeBtn,
      dislikeBtn,
      el(
        'button.reaction',
        {
          type: 'button',
          onclick: () => {
            if (!state.expanded.has(post.id)) {
              state.expanded.add(post.id);
              drawFeed();
            }
            setTimeout(() => {
              const node = feed.querySelector(`[data-post="${post.id}"] .comment-form input`);
              node?.focus();
            }, 40);
          },
        },
        [icon('messageCircle'), el('span.reaction__count', {}, formatCompact(post.comments.length))]
      ),
      el('span', { style: { flex: 1 } }),
      el(
        'button.reaction',
        {
          type: 'button',
          onclick: () => {
            navigator.clipboard?.writeText(window.location.href).then(
              () => toast({ title: 'Đã sao chép liên kết bài viết', variant: 'success' }),
              () => toast({ title: 'Không sao chép được', variant: 'warn' })
            );
          },
        },
        [icon('share'), el('span', {}, 'Chia sẻ')]
      ),
      canDelete
        ? el(
            'button.reaction',
            {
              type: 'button',
              onclick: () =>
                confirmDialog({
                  title: 'Xoá bài viết?',
                  message: 'Bài viết và toàn bộ bình luận sẽ bị xoá vĩnh viễn.',
                  confirmLabel: 'Xoá bài viết',
                  iconName: 'trash',
                  onConfirm: async () => {
                    try {
                      await postsApi.remove(post.id);
                      state.posts = state.posts.filter((p) => p.id !== post.id);
                      drawFeed();
                      toast({ title: 'Đã xoá bài viết', variant: 'success' });
                    } catch (error) {
                      toast({ title: 'Không xoá được', message: error.message, variant: 'error' });
                    }
                  },
                }),
            },
            [icon('trash'), el('span', {}, 'Xoá')]
          )
        : null,
    ]);

    /* --- Comments --- */
    const commentsNode = el('div.comments', { hidden: !isExpanded && post.comments.length === 0 ? false : false });

    const commentsBlock = el('div', { hidden: !isExpanded }, [
      post.comments.length
        ? el('div.comments', {}, [
            el('div.comments__head', {}, [
              el('span', {}, `${post.comments.length} bình luận`),
            ]),
            ...post.comments.map((comment, commentIndex) => commentNode(comment, commentIndex)),
          ])
        : null,
      commentForm(post),
    ]);

    function replacePost(updated) {
      const index = state.posts.findIndex((p) => p.id === updated.id);
      if (index >= 0) state.posts[index] = updated;
      drawFeed();
      drawRail();
    }

    return el(
      'article.post',
      {
        class: `course-c${(post.author?.avatarIndex ?? 0) % 6 + 1}`,
        'data-post': post.id,
        'data-reveal': '',
        style: { '--reveal-delay': `${Math.min(index, 6) * 60}ms` },
      },
      [
        el('header.post__head', {}, [
          avatar({ user: post.author, size: 'md', presence: true }),
          el('div.post__author', {}, [
            el('span.post__author-name', {}, post.author?.fullName ?? 'Không rõ'),
            el('div.post__author-meta', {}, [
              el('span', {}, post.author?.className ?? ''),
              el('span', {}, '·'),
              el('span', {}, post.relativeTime),
              post.author?.scholar && post.author.scholar !== 'Không'
                ? badge({ label: 'HB', variant: 'signal', iconName: 'award' })
                : null,
            ]),
          ]),
        ]),
        body,
        toggleMore,
        reactions,
        post.comments.length || isExpanded ? commentsBlock : null,
      ]
    );
  }

  function reactionButton({ count, active, iconName, label, tone, onclick }) {
    return el(
      'button',
      {
        type: 'button',
        class: `reaction reaction--${tone === 'danger' ? 'disliked' : 'liked'} ${active ? 'is-active' : ''}`.trim(),
        'aria-pressed': String(active),
        'aria-label': `${label}: ${count}`,
        onclick,
      },
      [
        icon(iconName),
        el('span.reaction__count', {}, formatCompact(count)),
      ]
    );
  }

  function commentNode(comment, index) {
    return el('div.comment', { 'data-reveal': 'left', style: { '--reveal-delay': `${index * 50}ms` } }, [
      avatar({ user: comment.author, size: 'sm' }),
      el('div.comment__body', {}, [
        el('div.comment__head', {}, [
          el('span.comment__author', {}, comment.author?.fullName ?? 'Không rõ'),
          el('span.comment__time', {}, comment.relativeTime),
        ]),
        el('div.comment__text', {}, comment.text),
        el('div.comment__actions', {}, [
          el(
            'button.comment__action.row-2',
            {
              type: 'button',
              onclick: () => toast({ title: 'Tính năng đang phát triển', variant: 'info' }),
            },
            [el('span', { style: { display: 'inline-flex' } }, icon('thumbsUp')), el('span', {}, 'Thích')]
          ),
        ]),
      ]),
    ]);
  }

  function commentForm(post) {
    const field = textInput({
      placeholder: 'Viết bình luận của bạn…',
      size: 'sm',
      maxLength: 1000,
    });

    field.node.classList.add('comment-form');

    const sendBtn = button({
      variant: 'primary',
      size: 'sm',
      iconOnly: true,
      iconName: 'send',
      label: 'Gửi bình luận',
      ariaLabel: 'Gửi bình luận',
      onclick: async () => {
        const text = field.input.value.trim();
        if (!text) return;

        sendBtn.classList.add('btn--loading');
        try {
          const updated = await postsApi.addComment(post.id, { text });
          const index = state.posts.findIndex((p) => p.id === post.id);
          if (index >= 0) state.posts[index] = updated;
          state.expanded.add(post.id);
          drawFeed();
          drawRail();
        } catch (error) {
          toast({ title: 'Không gửi được bình luận', message: error.message, variant: 'error' });
        } finally {
          sendBtn.classList.remove('btn--loading');
        }
      },
    });

    field.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendBtn.click();
      }
    });

    sendBtn.classList.add('comment-form__send');

    return el('div.comment-form', {}, [field.node, sendBtn]);
  }

  /* ---------- Side rail ---------- */
  function drawRail() {
    const trending = computeTrending();

    render(railSlot, 
      panel({
        title: 'Đang thịnh hành',
        titleIcon: 'trending',
        body: el('div.stack-1', {}, trending.map((item, index) =>
          el(
            'div.trend',
            {
              role: 'button',
              tabindex: '0',
              'data-reveal': 'left',
              style: { '--reveal-delay': `${index * 60}ms` },
              onclick: () => {
                search.input.value = item.tag;
                state.query = item.tag.toLowerCase();
                drawFeed();
              },
            },
            [
              el('span.trend__rank', {}, String(index + 1)),
              el('div.trend__body', {}, [
                el('span.trend__tag', {}, item.tag),
                el('span.trend__meta', {}, `${item.count} bài viết · ${item.engagement} lượt tương tác`),
              ]),
            ]
          )
        )),
      }),

      panel({
        title: 'Sinh viên tích cực',
        titleIcon: 'flame',
        body: el('div.stack-3', {}, students.slice(1, 6).map((student, index) => {
          const count = state.posts.filter((p) => p.authorId === student.id).length;
          return el('div.request-row', { 'data-reveal': 'left', style: { '--reveal-delay': `${index * 50}ms` } }, [
            avatar({ user: student, size: 'sm', presence: true }),
            el('div.request-row__info', {}, [
              el('span.request-row__name', {}, student.fullName),
              el('span.request-row__meta', {}, `${student.className} · ${count} bài đăng`),
            ]),
          ]);
        })),
      }),

      panel({
        title: 'Quy tắc đăng bài',
        titleIcon: 'shield',
        body: el('div.stack-2', {}, [
          ruleRow('Tôn trọng bạn bè và đồng môn'),
          ruleRow('Không chia sẻ thông tin cá nhân của người khác'),
          ruleRow('Gắn nhãn tài liệu kèm mã môn học khi có thể'),
          ruleRow('Bình luận xây dựng, không công kích'),
        ]),
      })
    );
  }

  function ruleRow(text) {
    return el('div.row-2', { style: { alignItems: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' } }, [
      el('span', { style: { display: 'inline-flex', color: 'var(--primary)', marginTop: '1px' } }, icon('check')),
      el('span', {}, text),
    ]);
  }

  function computeTrending() {
    const counts = new Map();

    state.posts.forEach((post) => {
      const tags = post.content.match(/#[\p{L}\d_]+/gu) ?? [];
      tags.forEach((tag) => {
        const current = counts.get(tag) ?? { tag, count: 0, engagement: 0 };
        current.count += 1;
        current.engagement += post.likes + post.comments.length;
        counts.set(tag, current);
      });
    });

    const hashtags = [...counts.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 5);

    if (hashtags.length >= 3) return hashtags;

    // Fallback: the most engaging authors
    const byAuthor = new Map();
    state.posts.forEach((post) => {
      const current = byAuthor.get(post.authorId) ?? {
        tag: post.author?.fullName ?? 'Không rõ',
        count: 0,
        engagement: 0,
      };
      current.count += 1;
      current.engagement += post.likes;
      byAuthor.set(post.authorId, current);
    });

    return [...byAuthor.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 5);
  }

  /* ---------- Assemble ---------- */
  const view = el('div.page', {}, [
    pageHeader({
      eyebrow: 'Cộng đồng',
      eyebrowIcon: 'messages',
      title: 'Bài đăng của sinh viên',
      subtitle: 'Chia sẻ thông tin, tìm đồ án, hỏi đáp và trao đổi với bạn cùng trường.',
    }),
    el('div.posts', {}, [
      el('div.stack-4', {}, [
        composer,
        el('div.toolbar', {}, [
          scopeSwitch.node,
          el('div', { style: { flex: 1 } }),
          el('div.toolbar__search', { style: { maxWidth: '18rem' } }, search.node),
        ]),
        feed,
      ]),
      railSlot,
    ]),
  ]);

  render(outlet, view);
  await load();
  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}
