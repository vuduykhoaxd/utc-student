/**
 * News & announcements
 * Featured story, category tabs, article grid, and a full reader view.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  emptyState,
  iconTile,
  notice,
} from '../components/ui.js';
import { searchInput } from '../components/forms.js';
import { pageHeader, section, backLink } from '../components/page.js';
import { newsApi } from '../core/api.js';
import { refreshUnread } from '../core/app-store.js';
import { formatDate, timeAgo, formatBytes } from '../utils/format.js';

/* -------------------------------------------------------------------------- */
/* List page                                                                   */
/* -------------------------------------------------------------------------- */

/** @param {HTMLElement} outlet */
export async function newsPage(ctx) {
  const outlet = ctx.outlet;

  const state = {
    query: '',
    items: [],
    loading: true,
    /** True once the portal feed rendered. */
    live: false,
    page: 1,
    pageSize: 20,
  };

  const grid = el('div.grid.grid-auto-lg');
  const featuredSlot = el('div');
  const subtitleSlot = el('span');
  const captionSlot = el('span', {}, 'Sắp xếp theo thời gian đăng');

  /**
   * Search only.
   *
   * The portal's announcements carry no reliable category, and filtering by
   * publisher duplicated the byline shown on every card, so both rails were
   * removed in favour of a single search field.
   */
  const search = searchInput({
    placeholder: 'Tìm theo tiêu đề hoặc nội dung…',
    onInput: (value) => {
      state.query = value;
      load();
    },
  });

  /**
   * Sequence guard.
   *
   * Requests are debounced but not serialised: a slow response for "toán" can
   * arrive after the response for "toán giải tích" and overwrite it. Only the
   * newest request is allowed to paint.
   */
  let loadToken = 0;

  async function load() {
    const token = ++loadToken;

    // Keep the current cards on screen while searching; the skeleton is only
    // for the very first paint, where there is nothing to keep.
    if (!state.items.length) {
      state.loading = true;
      draw();
    }

    try {
      // Prefer the portal; fall back to the bundled dataset so the page is
      // never blank just because the backend is down.
      const live = await newsApi.listLive({
        page: state.page,
        pageSize: state.pageSize,
        query: state.query,
      });

      if (token !== loadToken) return;

      if (live) {
        state.live = true;
        state.items = live.items;
      } else {
        const demo = await newsApi.list({ query: state.query });
        if (token !== loadToken) return;
        state.items = demo;
      }
    } catch (error) {
      if (token !== loadToken) return;
      console.error(error);
      state.items = [];
    }

    state.loading = false;

    subtitleSlot.textContent = state.live
      ? 'Nội dung trực tiếp từ cổng thông tin sinh viên UTC'
      : 'Đang hiển thị dữ liệu mẫu — không kết nối được hệ thống nhà trường';

    captionSlot.textContent = state.live
      ? 'Sắp xếp theo thời gian đăng'
      : 'Dữ liệu mẫu';

    draw();
  }

  function draw() {
    const articles = state.items;
    const featured = articles.find((a) => a.pinned) ?? articles[0];
    const rest = articles.filter((a) => a.id !== featured?.id);

    render(featuredSlot, featured ? featuredCard(featured) : null);

    if (state.loading) {
      render(grid,
        ...Array.from({ length: 6 }, (_, i) =>
          el('div.skeleton', {
            style: { height: '13rem', borderRadius: 'var(--radius-lg)', animationDelay: `${i * 60}ms` },
          })
        )
      );
      return;
    }

    if (!rest.length) {
      render(grid,
        emptyState({
          iconName: 'search',
          title: 'Không tìm thấy bài viết phù hợp',
          message: 'Thử tìm bằng từ khoá khác nhé.',
          action: state.query
            ? button({
                label: 'Xoá tìm kiếm',
                variant: 'soft',
                iconName: 'refresh',
                onclick: () => {
                  state.query = '';
                  search.input.value = '';
                  load();
                },
              })
            : null,
        })
      );
      return;
    }

    render(grid, ...rest.map(articleCard));
  }

  const view = el('div.page', {}, [
    pageHeader({
      eyebrow: 'Kênh thông tin',
      eyebrowIcon: 'megaphone',
      title: 'Tin tức & Thông báo',
      subtitle: subtitleSlot,
    }),
    el('div.toolbar', {}, [
      el('div.toolbar__search', {}, search.node),
      el('div.toolbar__divider'),
      el('span.caption', {}, captionSlot),
    ]),
    featuredSlot,
    section({ children: grid }),
  ]);

  render(outlet, view);
  await load();

  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}

/** Large hero article. */
function featuredCard(article) {
  const cat = article.categoryInfo;

  return el(
    'article.featured',
    {
      class: cat?.className ?? 'cat-khac',
      role: 'button',
      tabindex: '0',
      onclick: () => (window.location.hash = `/news/${article.id}`),
      onkeydown: (event) => {
        if (event.key === 'Enter') window.location.hash = `/news/${article.id}`;
      },
    },
    [
      el('div.featured__art'),
      el('div.featured__scrim'),
      el('div.featured__body', {}, [
        el('div.featured__meta', {}, [
          el(
            'span.featured__badge',
            { class: article.urgent ? 'featured__badge--urgent' : '' },
            [
              article.urgent ? icon('alert') : icon(cat?.iconName ?? 'news'),
              el('span', {}, cat?.label ?? 'Tin tức'),
            ]
          ),
          article.pinned ? el('span.featured__badge', {}, [icon('bookmark'), 'Ghim']) : null,
        ]),
        el('h2.featured__title', {}, article.title),
        el('p.featured__excerpt', {}, article.excerpt),
        el('div.featured__footer', {}, [
          el('span', {}, bylineOf(article)),
          el('span', {}, '•'),
          el('span', {}, timeAgo(article.publishedAt)),
          validityOf(article) ? el('span', {}, ['•', validityOf(article)]) : null,
        ]),
        el('span.featured__cta', {}, [el('span', {}, 'Đọc tiếp'), icon('arrowRight')]),
      ]),
    ]
  );
}

/** Standard article card. */
function articleCard(article, index = 0) {
  const cat = article.categoryInfo;

  return el(
    'article.article.spotlight',
    {
      class: [cat?.className ?? 'cat-khac', !article.isRead ? 'article--unread' : '']
        .filter(Boolean)
        .join(' '),
      'data-spotlight': '',
      'data-reveal': '',
      style: { '--reveal-delay': `${(index % 6) * 60}ms` },
      role: 'button',
      tabindex: '0',
      onclick: () => (window.location.hash = `/news/${article.id}`),
      onkeydown: (event) => {
        if (event.key === 'Enter') window.location.hash = `/news/${article.id}`;
      },
    },
    [
      el('div.article__top', {}, [
        el('span.article__cat', {}, [
          icon(cat?.iconName ?? 'news'),
          el('span', {}, cat?.label ?? article.publisher ?? 'Tin tức'),
        ]),
        el('span.article__date', {}, formatDate(article.publishedAt, 'short')),
      ]),
      el('h3.article__title.clamp-2', {}, article.title),
      el('p.article__excerpt.clamp-3', {}, article.excerpt),
      el('div.article__footer', {}, [
        el('div.article__author', {}, [
          iconTile({ iconName: 'building', tone: 'primary', size: 'sm' }),
          el('div.stack', { style: { gap: 0, minWidth: 0 } }, [
            el('span.article__author-name', {}, bylineOf(article)),
            // The portal exposes no view counter, so a count would be a lie.
            article.source === 'utc'
              ? null
              : el('span.caption', {}, `${formatNumberSafe(article.views)} lượt đọc`),
          ]),
        ]),
        el('span.article__read', {}, [el('span', {}, 'Đọc'), icon('arrowRight')]),
      ]),
    ]
  );
}

/**
 * Who published this.
 *
 * The portal's author field often repeats the department name verbatim
 * ("Phòng CTCT&SV Phòng CTCT&SV"), so a publisher that is a prefix of the author
 * wins, and an author that is just the publisher repeated is collapsed.
 */
function bylineOf(article) {
  const author = String(article.author ?? '').trim();
  const publisher = String(article.publisher ?? '').trim();

  if (!publisher) return author || 'Nhà trường';
  if (!author) return publisher;

  // "Phòng CTCT&SV Phòng CTCT&SV" -> "Phòng CTCT&SV"
  if (author.startsWith(publisher) && author.slice(publisher.length).trim() === publisher) {
    return publisher;
  }

  return publisher;
}

/** Validity window, when the portal supplied one. */
function validityOf(article) {
  if (!article.validFrom && !article.validTo) return null;

  const from = article.validFrom ? formatDate(article.validFrom, 'short') : '…';
  const to = article.validTo ? formatDate(article.validTo, 'short') : '…';

  return `Hiệu lực ${from} → ${to}`;
}

function formatNumberSafe(value) {
  return new Intl.NumberFormat('vi-VN').format(value ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Detail page                                                                 */
/* -------------------------------------------------------------------------- */

/** @param {HTMLElement} outlet @param {{params: object}} ctx */
export async function newsDetailPage(ctx) {
  const outlet = ctx.outlet;

  render(outlet, el('div.skeleton', { style: { height: '24rem', borderRadius: 'var(--radius-2xl)' } }));

  let article;
  let all;

  try {
    // The live feed carries the article body, so prefer it; the bundled article
    // is the fallback when the backend is unreachable.
    const liveArticle = await newsApi.getLive(ctx.params.id);

    if (liveArticle) {
      article = liveArticle;
      const feed = await newsApi.listLive({ pageSize: 6 });
      all = feed?.items ?? [];
    } else {
      [article, all] = await Promise.all([
        newsApi.get(ctx.params.id),
        newsApi.list({ limit: 5 }),
      ]);
    }
  } catch (error) {
    render(outlet, 
      emptyState({
        iconName: 'search',
        title: 'Không tìm thấy bài viết',
        message: error.message,
        action: backLink({ href: '/news', label: 'Về trang tin tức' }),
      })
    );
    return;
  }

  refreshUnread();

  const cat = article.categoryInfo;
  const related = all.filter((item) => item.id !== article.id).slice(0, 3);

  const view = el('article.reader', {}, [
    el('div.row-2', {}, [
      backLink({ href: '/news', label: 'Tin tức' }),
    ]),

    el('header.reader__hero', { class: cat?.className ?? 'cat-khac' }, [
      el('div', { class: 'reader__hero-art' }),
      el('div', { class: 'reader__hero-scrim' }),
      el('div.stack-3', {}, [
        el('div.row-2.row-wrap', {}, [
          el('span.featured__badge', { class: article.urgent ? 'featured__badge--urgent' : '' }, [
            icon(article.urgent ? 'alert' : (cat?.iconName ?? 'news')),
            el('span', {}, cat?.label ?? 'Tin tức'),
          ]),
          el('span.featured__badge', {}, [
            icon('clock'),
            el('span', {}, formatDate(article.publishedAt, 'datetime')),
          ]),
        ]),
        el('h1.reader__title', {}, article.title),
        el('div.row-3.row-wrap', {}, [
          el('div.row-2', {}, [
            iconTile({ iconName: 'building', tone: 'info', size: 'sm' }),
            el('span', { style: { fontSize: 'var(--text-sm)', fontWeight: 600 } }, bylineOf(article)),
          ]),
          // The portal has no view counter; showing a zero would be a fiction.
          article.source === 'utc'
            ? null
            : [
                el('span', { style: { opacity: 0.6 } }, '•'),
                el('span', { style: { fontSize: 'var(--text-sm)' } }, `${formatNumberSafe(article.views)} lượt đọc`),
              ],
          validityOf(article)
            ? el('span.article__valid', {}, validityOf(article))
            : null,
        ]),
      ]),
    ]),

    el('div.split', {}, [
      el('div.stack-5', {}, [
        article.urgent
          ? notice({
              text: 'Đây là thông báo khẩn. Vui lòng đọc và phân phối ngay đến lớp học.',
              variant: 'warn',
            })
          : null,

        el('p.reader__content', { 'data-reveal': '', style: { '--reveal-delay': '100ms' } }, article.body ?? article.content ?? ''),

        article.attachments?.length
          ? panel({
              title: 'Tệp đính kèm',
              titleIcon: 'paperclip',
              body: el('div.stack-2', {}, article.attachments.map((file) =>
                el(
                  'a.attach-card',
                  {
                    href: '#/news',
                    onclick: (event) => {
                      event.preventDefault();
                      import('../core/app-store.js').then(({ toast }) =>
                        toast({
                          title: 'Tải xuống (mô phỏng)',
                          message: `${file.name} · ${formatBytes(file.size)}`,
                          variant: 'info',
                        })
                      );
                    },
                  },
                  [
                    iconTile({ iconName: 'filePdf', tone: 'danger', size: 'sm' }),
                    el('div.grow', { style: { minWidth: 0 } }, [
                      el('div.truncate', { style: { fontWeight: 600, fontSize: 'var(--text-sm)' } }, file.name),
                      el('span.caption', {}, formatBytes(file.size)),
                    ]),
                    el('span.row-2', { style: { color: 'var(--primary)' } }, [
                      el('span', { style: { fontSize: 'var(--text-xs)', fontWeight: 600 } }, 'Tải'),
                      icon('download'),
                    ]),
                  ]
                )
              )),
            })
          : null,

        el('div.row-3.row-wrap', { style: { justifyContent: 'space-between' } }, [
          el('span.caption', {}, `Cập nhật lần cuối: ${timeAgo(article.publishedAt)}`),
          el('div.row-2', {}, [
            button({
              label: 'Chia sẻ',
              variant: 'secondary',
              size: 'sm',
              iconName: 'share',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  import('../core/app-store.js').then(({ toast }) =>
                    toast({ title: 'Đã sao chép liên kết', variant: 'success' })
                  );
                } catch {
                  import('../core/app-store.js').then(({ toast }) =>
                    toast({ title: 'Không sao chép được liên kết', variant: 'warn' })
                  );
                }
              },
            }),
            button({ label: 'In bài', variant: 'ghost', size: 'sm', iconName: 'fileText', onclick: () => window.print() }),
          ]),
        ]),
      ]),

      el('aside.sticky-aside', {}, [
        panel({
          title: 'Bài viết liên quan',
          titleIcon: 'layers',
          body: el('div.stack-1', {}, related.length
            ? related.map((item, index) =>
                el(
                  'div.news-preview__item',
                  {
                    role: 'button',
                    tabindex: '0',
                    'data-reveal': '',
                    style: { '--reveal-delay': `${index * 60}ms` },
                    onclick: () => (window.location.hash = `/news/${item.id}`),
                  },
                  [
                    el('div.grow', { style: { minWidth: 0 } }, [
                      el('div.clamp-2', { style: { fontSize: 'var(--text-sm)', fontWeight: 600, lineHeight: 1.4 } }, item.title),
                      el('span.caption', {}, timeAgo(item.publishedAt)),
                    ]),
                    el('span', { style: { color: 'var(--text-faint)', display: 'inline-flex' } }, icon('arrowUpRight')),
                  ]
                )
              )
            : [el('span.caption', {}, 'Chưa có bài viết liên quan.')]
          ),
        }),
      ]),
    ]),
  ]);

  render(outlet, view);
  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}
