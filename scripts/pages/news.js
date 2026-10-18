/**
 * News & announcements
 * Featured story, category tabs, article grid, and a full reader view.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  badge,
  chip,
  avatar,
  emptyState,
  tag,
  iconTile,
  notice,
  tabs as tabsFactory,
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

  const state = { category: 'all', query: '', items: [], loading: true };

  const grid = el('div.grid.grid-auto-lg');
  const featuredSlot = el('div');

  const tabsItems = [
    { id: 'all', label: 'Tất cả' },
    { id: 'hoc-thi', label: 'Học & Thi', iconName: 'graduation' },
    { id: 'thong-bao', label: 'Thông báo', iconName: 'megaphone' },
    { id: 'khoa', label: 'Khoa & Viện', iconName: 'building' },
    { id: 'su-kien', label: 'Sự kiện', iconName: 'sparkle' },
    { id: 'hoc-bong', label: 'Học bổng', iconName: 'award' },
    { id: 'hoat-dong', label: 'Hoạt động', iconName: 'flame' },
  ];

  const tabBar = tabsFactory({
    items: tabsItems,
    active: 'all',
    onChange: (id) => {
      state.category = id;
      tabBar.update(id);
      load();
    },
  });

  const search = searchInput({
    placeholder: 'Tìm theo tiêu đề hoặc nội dung…',
    onInput: (value) => {
      state.query = value;
      load();
    },
  });

  async function load() {
    state.loading = true;
    draw();

    try {
      state.items = await newsApi.list({ category: state.category, query: state.query });
    } catch (error) {
      console.error(error);
      state.items = [];
    }

    state.loading = false;
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
          message: 'Thử đổi từ khoá hoặc chọn chuyên mục khác nhé.',
          action: button({
            label: 'Xoá bộ lọc',
            variant: 'soft',
            iconName: 'refresh',
            onclick: () => {
              state.category = 'all';
              state.query = '';
              search.input.value = '';
              tabBar.update('all');
              load();
            },
          }),
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
      subtitle: 'Cập nhật từ nhà trường, khoa và các tổ chức sinh viên. Đọc là đánh dấu đã xem.',
    }),
    tabBar.node,
    el('div.toolbar', {}, [
      el('div.toolbar__search', {}, search.node),
      el('div.toolbar__divider'),
      el('span.caption', {}, 'Sắp xếp theo thời gian đăng'),
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
          el('span', {}, article.author),
          el('span', {}, '•'),
          el('span', {}, timeAgo(article.publishedAt)),
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
          el('span', {}, cat?.label ?? 'Tin tức'),
        ]),
        el('span.article__date', {}, formatDate(article.publishedAt, 'short')),
      ]),
      el('h3.article__title.clamp-2', {}, article.title),
      el('p.article__excerpt.clamp-3', {}, article.excerpt),
      el('div.article__footer', {}, [
        el('div.article__author', {}, [
          iconTile({ iconName: 'building', tone: 'primary', size: 'sm' }),
          el('div.stack', { style: { gap: 0, minWidth: 0 } }, [
            el('span.article__author-name', {}, article.author),
            el('span.caption', {}, `${formatNumberSafe(article.views)} lượt đọc`),
          ]),
        ]),
        el('span.article__read', {}, [el('span', {}, 'Đọc'), icon('arrowRight')]),
      ]),
    ]
  );
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
    [article, all] = await Promise.all([
      newsApi.get(ctx.params.id),
      newsApi.list({ limit: 5 }),
    ]);
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
            el('span', { style: { fontSize: 'var(--text-sm)', fontWeight: 600 } }, article.author),
          ]),
          el('span', { style: { opacity: 0.6 } }, '•'),
          el('span', { style: { fontSize: 'var(--text-sm)' } }, `${formatNumberSafe(article.views)} lượt đọc`),
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

        el('p.reader__content', { 'data-reveal': '', style: { '--reveal-delay': '100ms' } }, article.content),

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
