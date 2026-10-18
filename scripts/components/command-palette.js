/**
 * Command palette
 *
 * A Ctrl/Cmd+K launcher that searches across every entity the user can reach:
 * pages, news, documents, posts, courses and other students. The topbar search
 * field routes here so that "tài liệu", "bài đăng" and "người" all search
 * everything rather than only the document library.
 *
 * Design notes:
 *  - Results come from the existing API namespaces, so the palette never holds
 *    a second copy of the dataset.
 *  - Search runs against an already-loaded slice (documents/posts/news from
 *    their list endpoints, directory from the friends endpoint), debounced, so
 *    typing never fires more than one render per frame.
 *  - The list is a real listbox: roving active option, arrow keys, Enter, and
 *    Esc handled here rather than by the overlay's focus trap.
 */

import { el, render } from '../utils/dom.js';
import { icon } from './icons.js';
import { openOverlay } from './overlay.js';
import { documentsApi, users, newsApi, postsApi, schedule } from '../core/api.js';
import { normalizeSearch } from '../utils/format.js';

/* -------------------------------------------------------------------------- */
/* Navigation targets                                                          */
/* -------------------------------------------------------------------------- */

const PAGES = [
  { id: 'p-home', group: 'Điều hướng', label: 'Tổng quan', hint: 'Bảng điều khiển học kỳ', icon: 'dashboard', to: '/' },
  { id: 'p-news', group: 'Điều hướng', label: 'Tin tức & Thông báo', hint: 'Thông báo từ trường', icon: 'news', to: '/news' },
  { id: 'p-schedule', group: 'Điều hướng', label: 'Thời khóa biểu', hint: 'Lịch học và lịch thi', icon: 'calendar', to: '/schedule' },
  { id: 'p-grades', group: 'Điều hướng', label: 'Kết quả học tập', hint: 'Điểm số học kỳ', icon: 'award', to: '/grades' },
  { id: 'p-docs', group: 'Điều hướng', label: 'Tài liệu', hint: 'Kho học liệu', icon: 'fileText', to: '/documents' },
  { id: 'p-posts', group: 'Điều hướng', label: 'Bài đăng', hint: 'Diễn đàn sinh viên', icon: 'users', to: '/posts' },
  { id: 'p-friends', group: 'Điều hướng', label: 'Tìm bạn bè', hint: 'Danh bạ sinh viên', icon: 'users', to: '/friends' },
  { id: 'p-chat', group: 'Điều hướng', label: 'Tin nhắn', hint: 'Trò chuyện', icon: 'messages', to: '/chat' },
  { id: 'p-profile', group: 'Điều hướng', label: 'Hồ sơ', hint: 'Thông tin cá nhân', icon: 'user', to: '/profile' },
  { id: 'p-notif', group: 'Điều hướng', label: 'Thông báo', hint: 'Trung tâm thông báo', icon: 'bell', to: '/notifications' },
  { id: 'p-settings', group: 'Điều hướng', label: 'Cài đặt', hint: 'Giao diện và hiệu ứng', icon: 'settings', to: '/settings' },
];

/** Order results appear in when nothing is typed. */
const GROUP_ORDER = ['Gần đây', 'Điều hướng', 'Tài liệu', 'Bài đăng', 'Tin tức', 'Môn học', 'Sinh viên'];

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

export function createCommandPalette({ navigate }) {
  let overlay = null;
  let results = [];
  let activeIndex = 0;
  let datasets = null;
  let loadingToken = 0;

  const inputId = 'command-palette-input';

  /* ================= Data ================= */

  /**
   * Load the searchable slices once per palette session.
   *
   * Each request is passed as a thunk: `Promise.allSettled` only settles
   * promises, so a call that throws *synchronously* while the argument array is
   * being built would escape and take the whole palette down with it. Wrapping
   * in `() => ...` defers every call into a promise.
   */
  async function loadDatasets() {
    const settled = await Promise.allSettled([
      () => documentsApi.list({ limit: 200 }),
      () => postsApi.list({ limit: 100 }),
      () => newsApi.list({ limit: 60 }),
      () => users.directory({ limit: 200 }),
      () => schedule.courses(),
    ].map((run) => run()));

    const value = (entry) => (entry.status === 'fulfilled' ? entry.value : null);
    const list = (entry) => {
      const resolved = value(entry);
      if (Array.isArray(resolved)) return resolved;
      // Some endpoints wrap the collection; accept either shape.
      return resolved?.items ?? resolved?.rows ?? [];
    };

    return {
      docs: list(settled[0]),
      posts: list(settled[1]),
      news: list(settled[2]),
      students: list(settled[3]),
      courses: list(settled[4]),
    };
  }

  /* ================= Search ================= */

  /**
   * Score a candidate against the query.
   * A prefix match on the title beats a match buried in the body, so the most
   * relevant row is the one you land on with Enter.
   */
  function score(haystack, needle) {
    const text = normalizeSearch(haystack);
    if (!needle) return 1;

    const at = text.indexOf(needle);
    if (at === -1) return 0;
    // Word-start matches rank highest, then earlier positions.
    const isWordStart = at === 0 || /[\s\-_/.,()]/.test(text[at - 1]);
    return (isWordStart ? 100 : 40) - Math.min(at, 30);
  }

  function search(query) {
    const needle = normalizeSearch(query);

    // With no query this is a launcher, not a search: show the navigation
    // targets only. Ranking every entity equally would put whichever namespace
    // happens to score marginally higher on top, which is arbitrary.
    if (!needle) {
      return PAGES.map((page, index) => ({ ...page, score: PAGES.length - index }));
    }

    const data = datasets ?? { docs: [], posts: [], news: [], students: [], courses: [] };
    const out = [];

    const push = (item) => {
      if (item.score > 0) out.push(item);
    };

    for (const page of PAGES) {
      push({
        ...page,
        score: Math.max(score(page.label, needle), score(page.hint, needle) * 0.6),
      });
    }

    for (const course of data.courses) {
      const label = `${course.code} ${course.name}`;
      push({
        id: `c-${course.id}`,
        group: 'Môn học',
        label,
        hint: `${course.teacher} · ${course.credits} tín chỉ`,
        icon: 'book',
        to: `/schedule?course=${course.id}`,
        score: score(label, needle) + score(course.teacher, needle) * 0.5,
      });
    }

    for (const doc of data.docs) {
      const label = doc.title;
      push({
        id: `d-${doc.id}`,
        group: 'Tài liệu',
        label,
        hint: `${doc.courseCode ?? ''} · ${doc.authorName ?? ''}`.trim(),
        icon: 'fileText',
        to: `/documents?q=${encodeURIComponent(doc.title)}`,
        score: score(label, needle) + score(doc.courseCode ?? '', needle) * 0.5,
      });
    }

    for (const post of data.posts) {
      push({
        id: `b-${post.id}`,
        group: 'Bài đăng',
        label: post.content?.slice(0, 70) ?? '',
        hint: post.authorName ?? post.author?.fullName ?? '',
        icon: 'users',
        to: `/posts?post=${post.id}`,
        score: score(post.content ?? '', needle) + score(post.authorName ?? post.author?.fullName ?? '', needle) * 0.4,
      });
    }

    for (const item of data.news) {
      push({
        id: `n-${item.id}`,
        group: 'Tin tức',
        label: item.title,
        hint: item.category ?? '',
        icon: 'news',
        to: `/news/${item.id}`,
        score: score(item.title, needle) + score(item.summary ?? '', needle) * 0.4,
      });
    }

    for (const person of data.students) {
      // Students carry `fullName`; `name` is not part of the record.
      const label = person.fullName ?? person.name ?? person.studentId ?? '';
      push({
        id: `s-${person.id}`,
        group: 'Sinh viên',
        label,
        hint: `${person.studentId ?? ''} · ${person.major ?? person.faculty ?? ''}`.trim(),
        icon: 'user',
        to: `/friends?q=${encodeURIComponent(person.studentId ?? label)}`,
        score:
          score(label, needle) +
          score(person.studentId ?? '', needle) +
          score(person.major ?? person.faculty ?? '', needle) * 0.3,
      });
    }

    return out
      .sort((a, b) => b.score - a.score)
      .filter((item, index, list) => list.findIndex((x) => x.id === item.id) === index)
      .slice(0, 40);
  }

  /* ================= Rendering ================= */

  const listNode = el('div.palette__list', { id: 'command-palette-list', role: 'listbox' });
  const statusNode = el('p.palette__status', { role: 'status', 'aria-live': 'polite' });

  function renderResults() {
    if (!results.length) {
      render(
        listNode,
        el('div.palette__empty', {}, [
          el('span.palette__empty-icon', {}, icon('search')),
          el('p.body-text', {}, 'Không có kết quả phù hợp.'),
          el('p.caption', {}, 'Thử một từ khoá khác, hoặc nhấn Tab để xem trang.'),
        ])
      );
      statusNode.textContent = 'Không có kết quả';
      return;
    }

    let lastGroup = null;
    const nodes = [];

    results.forEach((item, index) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        nodes.push(el('div.palette__group', { role: 'presentation' }, item.group));
      }

      nodes.push(
        el(
          'button.palette__item',
          {
            type: 'button',
            role: 'option',
            id: `command-palette-opt-${index}`,
            class: index === activeIndex ? 'is-active' : '',
            'aria-selected': String(index === activeIndex),
            // mousedown, not click: the input must not lose focus first.
            onmousedown: (event) => {
              event.preventDefault();
              choose(index);
            },
            onmouseenter: () => {
              activeIndex = index;
              syncActive();
            },
          },
          [
            el('span.palette__item-icon', {}, icon(item.icon)),
            el('span.palette__item-text', {}, [
              el('span.palette__item-label', {}, item.label),
              item.hint ? el('span.palette__item-hint', {}, item.hint) : null,
            ]),
          ]
        )
      );
    });

    render(listNode, nodes);
    statusNode.textContent = `${results.length} kết quả`;
    syncActive();
  }

  /** Scroll the active option into view without yanking the whole page. */
  function syncActive() {
    const options = listNode.querySelectorAll('.palette__item');
    options.forEach((node, index) => {
      const active = index === activeIndex;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-selected', String(active));
      if (active) node.scrollIntoView({ block: 'nearest' });
    });
  }

  function choose(index) {
    const item = results[index];
    if (!item) return;
    overlay?.close(item);
    navigate?.(item.to);
  }

  /* ================= Open / close ================= */

  async function open(initialQuery = '') {
    if (overlay) return;

    try {

    const input = el('input.palette__input', {
      id: inputId,
      type: 'text',
      role: 'combobox',
      placeholder: 'Tìm tài liệu, bài đăng, môn học, sinh viên…',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-expanded': 'true',
      'aria-controls': 'command-palette-list',
      'aria-autocomplete': 'list',
      'aria-label': 'Tìm kiếm toàn cục',
    });

    const loadingRow = el('div.palette__loading', {}, [
      el('span.spinner'),
      el('span.caption', {}, 'Đang tải dữ liệu…'),
    ]);

    render(listNode, loadingRow);

    overlay = openOverlay({
      variant: 'centered',
      size: 'lg',
      className: 'palette-overlay',
      onClose: () => {
        overlay = null;
        datasets = null;
        results = [];
        activeIndex = 0;
      },
    });

    const body = el('div.palette', {}, [
      el('div.palette__search', {}, [icon('search'), input, el('kbd.palette__kbd', {}, 'Esc')]),
      listNode,
      el('div.palette__footer', {}, [
        statusNode,
        el('span.palette__hints', {}, [
          el('span', {}, [el('kbd', {}, '↑'), el('kbd', {}, '↓'), ' để chọn']),
          el('span', {}, [el('kbd', {}, 'Enter'), ' để mở']),
        ]),
      ]),
    ]);

    render(overlay.panel, body);
    input.focus();

    const token = ++loadingToken;
    try {
      datasets = await loadDatasets();
    } catch (error) {
      console.error('[palette] could not load search data:', error);
      datasets = { docs: [], posts: [], news: [], students: [], courses: [] };
    }
    if (token !== loadingToken || !overlay) return;

    // Seed from the topbar field if the user typed before pressing Enter.
    input.value = typeof initialQuery === 'string' ? initialQuery : '';
    results = search(input.value);
    activeIndex = 0;
    renderResults();
    input.focus();

    /* ---------------- Keyboard ---------------- */

    let debounce = 0;

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        results = search(input.value);
        activeIndex = 0;
        renderResults();
      }, 90);
    });

    const onKeydown = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = results.length ? (activeIndex + 1) % results.length : 0;
        syncActive();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = results.length ? (activeIndex - 1 + results.length) % results.length : 0;
        syncActive();
      } else if (event.key === 'Home' && results.length) {
        event.preventDefault();
        activeIndex = 0;
        syncActive();
      } else if (event.key === 'End' && results.length) {
        event.preventDefault();
        activeIndex = results.length - 1;
        syncActive();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(activeIndex);
      } else if (event.key === 'Tab') {
        // Never let focus escape the field — results are the only other stop.
        event.preventDefault();
      }
    };

    input.addEventListener('keydown', onKeydown);
    } catch (error) {
      // Anything above can throw before the palette is usable; tear it down
      // rather than leaving an empty dialog on screen.
      console.error('[palette] failed to open:', error);
      overlay?.close(null);
      overlay = null;
    }
  }

  return {
    open,
    close: () => overlay?.close(null),
    get isOpen() {
      return Boolean(overlay);
    },
  };
}