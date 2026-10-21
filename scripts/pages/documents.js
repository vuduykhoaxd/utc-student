/**
 * Documents
 * Share a document with course, title, optional description, timestamp and
 * author. Browse with search plus course / type / semester filters and sorting.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  badge,
  avatar,
  emptyState,
  filterOption,
  iconTile,
  notice,
  stat,
  segmented,
} from '../components/ui.js';
import { searchInput, textInput, select, textarea, dropzone, debounceFn } from '../components/forms.js';
import { pageHeader, section } from '../components/page.js';
import { documentsApi, schedule as scheduleApi } from '../core/api.js';
import { toast, authStore } from '../core/app-store.js';
import { formatBytes, formatCompact, formatNumber, timeAgo } from '../utils/format.js';
import { confirmDialog } from '../components/overlay.js';

const FILE_TYPE_META = {
  pdf: { label: 'PDF', iconName: 'filePdf', className: 'ft-pdf' },
  doc: { label: 'Word', iconName: 'fileText', className: 'ft-doc' },
  xls: { label: 'Excel', iconName: 'sheet', className: 'ft-xls' },
  ppt: { label: 'PowerPoint', iconName: 'slides', className: 'ft-ppt' },
  zip: { label: 'Nén', iconName: 'archive', className: 'ft-zip' },
  img: { label: 'Ảnh', iconName: 'image', className: 'ft-img' },
  other: { label: 'Khác', iconName: 'file', className: 'ft-other' },
};

const SORTS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'downloads', label: 'Tải nhiều' },
  { id: 'likes', label: 'Được thích' },
  { id: 'title', label: 'Tên A–Z' },
];

/** @param {HTMLElement} outlet @param {{search: object}} ctx */
export async function documentsPage(ctx) {
  const outlet = ctx.outlet;

  const courses = await scheduleApi.courses();

  const state = {
    query: ctx.search?.q ?? '',
    courseId: ctx.search?.course ?? 'all',
    fileType: 'all',
    semester: 'all',
    sort: 'newest',
    page: 1,
    pageSize: 9,
    result: { items: [], total: 0, totalPages: 1, facets: { courses: [], fileTypes: {}, semesters: [] } },
  };

  const grid = el('div.grid.grid-auto');
  const summary = el('div.grid.grid-auto-sm');
  const facetSlot = el('div.filter-panel');
  const resultBar = el('div.result-bar');

  /* ---------- Data ---------- */
  async function load() {
    const result = await documentsApi.list({
      query: state.query,
      courseId: state.courseId,
      fileType: state.fileType,
      semester: state.semester,
      sort: state.sort,
      page: state.page,
      pageSize: state.pageSize,
    });
    state.result = result;
    draw();
  }

  /* ---------- Drawing ---------- */
  function draw() {
    drawSummary();
    drawFacets();
    drawGrid();
    drawResultBar();
  }

  function drawSummary() {
    const mine = state.result.items.filter((doc) => doc.authorId === authAuthorId());
    render(summary, 
      stat({ label: 'Tài liệu tìm thấy', value: state.result.total, iconName: 'folder', meta: 'Trong thư viện chung', tint: 'var(--primary-soft)' }),
      stat({ label: 'Trang hiện tại', value: `${state.result.page}/${state.result.totalPages}`, iconName: 'layers', meta: activeTypeLabel(state.fileType), tint: 'var(--accent-soft)' }),
      stat({ label: 'Của bạn', value: mine.length, iconName: 'share', meta: 'Tài liệu bạn đã chia sẻ', tint: 'var(--violet-soft)' }),
      stat({
        label: 'Tổng lượt tải',
        value: formatCompact(state.result.items.reduce((sum, doc) => sum + doc.downloads, 0)),
        iconName: 'download',
        meta: 'Trong kết quả hiện tại',
        tint: 'var(--success-soft)',
      })
    );
  }

  function drawFacets() {
    const facets = state.result.facets;

    render(facetSlot, 
      el('div.filter-group', {}, [
        el('div.filter-group__title', {}, [icon('book'), el('span', {}, 'Môn học')]),
        filterOption({
          label: 'Tất cả môn',
          count: facets.courses.reduce((sum, c) => sum + c.count, 0),
          active: state.courseId === 'all',
          onclick: () => setFilter('courseId', 'all'),
        }),
        ...facets.courses.map((facet) => {
          // The backend only knows the course id; the catalogue supplies the
          // code and name the UI shows.
          const course = courses.find((c) => c.id === facet.id);
          return filterOption({
            label: course ? `${course.code} · ${course.name}` : 'Môn khác',
            count: facet.count,
            active: state.courseId === facet.id,
            onclick: () => setFilter('courseId', facet.id),
          });
        }),
      ]),

      el('div.filter-group', {}, [
        el('div.filter-group__title', {}, [icon('file'), el('span', {}, 'Loại tệp')]),
        filterOption({
          label: 'Tất cả định dạng',
          active: state.fileType === 'all',
          onclick: () => setFilter('fileType', 'all'),
        }),
        ...Object.entries(facets.fileTypes)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) =>
            filterOption({
              label: FILE_TYPE_META[type]?.label ?? type,
              count,
              active: state.fileType === type,
              onclick: () => setFilter('fileType', type),
            })
          ),
      ]),

      el('div.filter-group', {}, [
        el('div.filter-group__title', {}, [icon('calendar'), el('span', {}, 'Học kỳ')]),
        filterOption({ label: 'Tất cả học kỳ', active: state.semester === 'all', onclick: () => setFilter('semester', 'all') }),
        ...facets.semesters.map((semester) =>
          filterOption({
            label: semester,
            count: null,
            active: state.semester === semester,
            onclick: () => setFilter('semester', semester),
          })
        ),
      ]),

      el('div.filter-group', {}, [
        el('div.filter-group__title', {}, [icon('trending'), el('span', {}, 'Sắp xếp')]),
        ...SORTS.map((sort) =>
          filterOption({
            label: sort.label,
            count: null,
            active: state.sort === sort.id,
            onclick: () => setFilter('sort', sort.id),
          })
        ),
      ]),

      hasActiveFilters()
        ? button({
            type: 'button',
            iconName: 'refresh',
            label: 'Xoá tất cả bộ lọc',
            variant: 'soft',
            size: 'sm',
            block: true,
            onclick: () => {
              Object.assign(state, {
                query: '',
                courseId: 'all',
                fileType: 'all',
                semester: 'all',
                sort: 'newest',
                page: 1,
              });
              search.input.value = '';
              load();
            },
          })
        : null
    );

    function hasActiveFilters() {
      return state.courseId !== 'all' || state.fileType !== 'all' || state.semester !== 'all';
    }
  }

  function drawResultBar() {
    const active = [];
    if (state.courseId !== 'all') {
      const course = courses.find((c) => c.id === state.courseId);
      active.push({ label: course ? `${course.code}` : 'Môn khác', onClear: () => setFilter('courseId', 'all') });
    }
    if (state.fileType !== 'all') {
      active.push({
        label: FILE_TYPE_META[state.fileType]?.label ?? state.fileType,
        onClear: () => setFilter('fileType', 'all'),
      });
    }
    if (state.semester !== 'all') {
      active.push({ label: state.semester, onClear: () => setFilter('semester', 'all') });
    }
    if (state.query) {
      active.push({ label: `"${state.query}"`, onClear: () => { state.query = ''; search.input.value = ''; setFilter('query', ''); } });
    }

    render(resultBar, 
      el('span', {}, [
        'Tìm thấy ',
        el('strong', {}, formatNumber(state.result.total)),
        ' tài liệu',
      ]),
      active.length
        ? el('div.active-filters', {}, [
            el('span.caption', {}, 'Bộ lọc:'),
            ...active.map((filter) =>
              el(
                'button.chip.is-active',
                { type: 'button', onclick: filter.onClear },
                [el('span', {}, filter.label), el('span.chip__x', {}, icon('close'))]
              )
            ),
          ])
        : null,
      el('span', { style: { flex: 1 } }),
      state.result.totalPages > 1 ? pagination() : null
    );
  }

  function pagination() {
    const { page, totalPages } = state.result;

    const go = async (next) => {
      state.page = Math.max(1, Math.min(totalPages, next));
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const numbers = [];
    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) numbers.push(i);
      else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
    }

    return el('nav.pagination', { 'aria-label': 'Phân trang' }, [
      el('button.pagination__btn', { type: 'button', disabled: page === 1, 'aria-label': 'Trang trước', onclick: () => go(page - 1) }, icon('chevronLeft')),
      ...numbers.map((n) =>
        n === '…'
          ? el('span.pagination__gap', {}, '…')
          : el('button.pagination__btn', { type: 'button', class: n === page ? 'is-active' : '', onclick: () => go(n) }, String(n))
      ),
      el('button.pagination__btn', { type: 'button', disabled: page === totalPages, 'aria-label': 'Trang sau', onclick: () => go(page + 1) }, icon('chevronRight')),
    ]);
  }

  function drawGrid() {
    const items = state.result.items;

    if (!items.length) {
      render(grid, 
        emptyState({
          iconName: 'folder',
          title: 'Không tìm thấy tài liệu phù hợp',
          message: 'Thử bỏ bớt bộ lọc hoặc tìm bằng từ khoá khác. Nếu vẫn chưa có, hãy là người đầu tiên chia sẻ!',
          action: button({
            label: 'Chia sẻ tài liệu',
            variant: 'soft',
            iconName: 'upload',
            onclick: openShareModal,
          }),
        })
      );
      return;
    }

    render(grid, ...items.map((doc, index) => docCard(doc, index)));
  }

  function docCard(doc, index) {
    const meta = FILE_TYPE_META[doc.fileType] ?? FILE_TYPE_META.other;
    const isMine = doc.authorId === authAuthorId();
    const colorName = COLOR_NAMES[(doc.colorIndex - 1) % COLOR_NAMES.length];

    return el(
      'article.doc',
      {
        class: meta.className,
        'data-spotlight': '',
        'data-reveal': 'zoom',
        style: { '--reveal-delay': `${(index % 9) * 55}ms` },
      },
      [
        el('div.doc__head', {}, [
          el('span.file-glyph', {}, [
            icon(meta.iconName),
            el('span.file-glyph__ext', {}, (doc.fileName.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()),
          ]),
          el('div.doc__titles', {}, [
            el('span.doc__course', {}, [icon('book'), `${doc.courseCode} · ${doc.courseName}`]),
            el('h3.doc__title.clamp-2', {}, doc.title),
          ]),
          el('button.quick-action', {
            type: 'button',
            'aria-label': 'Tuỳ chọn',
            onclick: (event) => openDocMenu(event.currentTarget, doc, isMine),
          }, icon('more')),
        ]),

        el('p.doc__desc', {}, doc.description || 'Không có mô tả.'),

        el('div.doc__meta', {}, [
          el('span', {}, formatBytes(doc.fileSize)),
          el('span.doc__meta-sep'),
          el('span', {}, timeAgo(doc.createdAt)),
          el('span.doc__meta-sep'),
          badge({ label: doc.semester, variant: 'neutral' }),
        ]),

        doc.tags?.length
          ? el('div.row-2.row-wrap', {}, doc.tags.slice(0, 3).map((tagName) =>
              el('span.chip', { style: { height: '1.6rem', fontSize: 'var(--text-2xs)' } }, tagName)
            ))
          : null,

        el('div.doc__author', {}, [
          avatar({ user: doc.author, size: 'xs' }),
          el('span.doc__author-name', {}, doc.author?.fullName ?? 'Không rõ'),
          el('div.doc__actions', {}, [
            el('span.doc__stat', {}, [icon('download'), formatCompact(doc.downloads)]),
            el('span', { class: `doc__stat ${doc.viewerLiked ? 'doc__stat--hot' : ''}` }, [icon('star'), formatCompact(doc.likes)]),
            el(
              'button.quick-action',
              {
                type: 'button',
                'aria-label': 'Tải xuống',
                title: 'Tải xuống',
                onclick: async () => {
                  const updated = await documentsApi.download(doc.id);
                  const index = state.result.items.findIndex((d) => d.id === doc.id);
                  if (index >= 0) state.result.items[index] = updated;
                  toast({
                    title: 'Đang tải xuống (mô phỏng)',
                    message: `${doc.fileName} · ${formatBytes(doc.fileSize)}`,
                    variant: 'success',
                  });
                },
              },
              icon('download')
            ),
          ]),
        ]),
      ]
    );
  }

  async function openDocMenu(anchor, doc, isMine) {
    const { openMenu } = await import('../components/menu.js');

    openMenu({
      anchor,
      items: [
        {
          label: 'Tải xuống',
          iconName: 'download',
          onSelect: async () => {
            await documentsApi.download(doc.id);
            toast({ title: 'Đang tải xuống (mô phỏng)', message: doc.fileName, variant: 'success' });
          },
        },
        {
          label: doc.viewerLiked ? 'Bỏ đánh giá hữu ích' : 'Đánh giá hữu ích',
          iconName: 'star',
          onSelect: async () => {
            const updated = await documentsApi.toggleLike(doc.id);
            const index = state.result.items.findIndex((d) => d.id === doc.id);
            if (index >= 0) state.result.items[index] = updated;
            drawGrid();
          },
        },
        {
          label: 'Sao chép liên kết',
          iconName: 'copy',
          onSelect: () => {
            navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/documents`);
            toast({ title: 'Đã sao chép liên kết', variant: 'success' });
          },
        },
        ...(isMine
          ? [
              { type: 'separator' },
              {
                label: 'Xoá tài liệu',
                iconName: 'trash',
                danger: true,
                onSelect: () =>
                  confirmDialog({
                    title: 'Xoá tài liệu?',
                    message: `"${doc.title}" sẽ bị xoá khỏi thư viện chung.`,
                    confirmLabel: 'Xoá',
                    iconName: 'trash',
                    onConfirm: async () => {
                      try {
                        await documentsApi.remove(doc.id);
                        toast({ title: 'Đã xoá tài liệu', variant: 'success' });
                        await load();
                      } catch (error) {
                        toast({ title: 'Không xoá được', message: error.message, variant: 'error' });
                      }
                    },
                  }),
              },
            ]
          : []),
      ],
    });
  }

  function setFilter(key, value) {
    state[key] = value;
    state.page = 1;
    load();
  }

  /* ---------- Search ---------- */
  const debouncedLoad = debounceFn(load, 260);

  /** Sort control in the toolbar. */
  const sortSwitch = segmented({
    items: SORTS.map((sort) => ({ id: sort.id, label: sort.label })),
    active: state.sort,
    onChange: (id) => {
      state.sort = id;
      state.page = 1;
      sortSwitch.update(id);
      load();
    },
  });

  const search = searchInput({
    placeholder: 'Tìm tài liệu theo tiêu đề, mô tả hoặc tên tệp…',
    value: state.query,
    onInput: (value) => {
      state.query = value;
      state.page = 1;
      debouncedLoad();
    },
  });

  /* ---------- Share modal ---------- */
  async function openShareModal() {
    const { modal } = await import('../components/overlay.js');

    let file = null;
    let previewName = null;
    let previewSize = null;

    const fileInfo = el('div.notice', { style: { display: 'none' } });
    const showFileInfo = (message, variant = 'info') => {
      render(fileInfo, 
        el('span', { style: { display: 'inline-flex', flexShrink: 0, marginTop: '1px' } }, icon(variant === 'error' ? 'alert' : 'file')),
        el('span', {}, message)
      );
      fileInfo.style.display = 'flex';
    };

    const titleField = textInput({
      label: 'Tiêu đề',
      placeholder: 'VD: Bài giảng Tuần 5 — Hệ điều khiển',
      iconName: 'fileText',
      maxLength: 120,
      required: true,
      autofocus: true,
    });

    const courseField = select({
      label: 'Môn học',
      required: true,
      options: [
        { value: '', label: '— Chọn môn học —' },
        ...courses.map((course) => ({
          value: course.id,
          label: `${course.code} · ${course.name}`,
        })),
      ],
    });

    const descField = textarea({
      label: 'Mô tả (không bắt buộc)',
      placeholder: 'Nội dung tài liệu, phạm vi, nguồn tham khảo…',
      rows: 3,
      maxLength: 500,
      hint: 'Tối đa 500 ký tự. Giúp bạn bè nhanh chóng biết tài liệu có gì.',
    });

    const zone = dropzone({
      accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.png,.jpg,.jpeg',
      hint: 'PDF, Office, nén hoặc ảnh — tối đa 10 MB',
      onFiles: (files) => {
        const chosen = files[0];
        if (chosen.size > 10 * 1024 * 1024) {
          showFileInfo('Tệp vượt quá 10 MB. Vui lòng chọn tệp nhỏ hơn.', 'error');
          return;
        }
        file = chosen;
        previewName = chosen.name;
        previewSize = chosen.size;
        showFileInfo(`Đã chọn: ${chosen.name} (${formatBytes(chosen.size)})`);
      },
    });

    const submitBtn = button({
      label: 'Chia sẻ tài liệu',
      iconName: 'upload',
      onclick: async () => {
        const title = titleField.input.value.trim();
        const courseId = courseField.value;
        const description = descField.value.trim();

        titleField.clearError?.();
        courseField.clearError?.();

        let valid = true;
        if (!title) {
          titleField.setError?.('Vui lòng nhập tiêu đề tài liệu.');
          valid = false;
        }
        if (!courseId) {
          courseField.setError?.('Vui lòng chọn môn học.');
          valid = false;
        }
        if (!valid) return;

        submitBtn.classList.add('btn--loading');
        try {
          await documentsApi.create({
            title,
            courseId,
            description,
            tags: [],
            file: file ?? (previewName ? { name: previewName, size: previewSize, type: 'application/pdf' } : null),
          });
          dialog.close();
          state.page = 1;
          await load();
          toast({
            title: 'Đã chia sẻ tài liệu',
            message: `${title} · ${formatDateStamp(new Date())}`,
            variant: 'success',
          });
        } catch (error) {
          toast({ title: 'Không chia sẻ được', message: error.message, variant: 'error' });
        } finally {
          submitBtn.classList.remove('btn--loading');
        }
      },
    });

    const dialog = modal({
      title: 'Chia sẻ tài liệu',
      description: 'Đóng góp tài liệu học tập cho cả lớp. Tài liệu sẽ hiển thị kèm môn học, tiêu đề, thời gian đăng và tên của bạn.',
      size: 'lg',
      body: [
        zone.node,
        fileInfo,
        titleField.node,
        courseField.node,
        descField.node,
        el('div.divider'),
        el('div.grid.grid-2', {}, [
          infoPreview('Môn học', 'Bắt buộc'),
          infoPreview('Tiêu đề', 'Bắt buộc'),
        ]),
      ],
      footer: [
        el('span.caption', { style: { marginRight: 'auto' } }, [
          icon('shield'),
          ' Tài liệu sẽ được gắn tên và mã sinh viên của bạn tự động.',
        ]),
        button({ label: 'Huỷ', variant: 'ghost', onclick: () => dialog.close() }),
        submitBtn,
      ],
    });

    function infoPreview(label, required) {
      return el('div.info-item', {}, [
        el('div.info-item__label', {}, [el('span', {}, label)]),
        el('span.info-item__value', {}, [
          required ? badge({ label: 'Bắt buộc', variant: 'primary' }) : badge({ label: 'Tuỳ chọn', variant: 'neutral' }),
        ]),
      ]);
    }
  }

  /* ---------- Assemble ---------- */
  const view = el('div.page.docs', {}, [
    pageHeader({
      eyebrow: 'Học tập',
      eyebrowIcon: 'folder',
      title: 'Thư viện tài liệu',
      subtitle: 'Tài liệu do sinh viên trong trường đóng góp. Tìm theo môn học, loại tệp hoặc học kỳ.',
      actions: [
        button({
          label: 'Chia sẻ tài liệu',
          iconName: 'upload',
          onclick: openShareModal,
        }),
      ],
    }),

    // Filters live in a left rail; the document grid gets the remaining width.
    el('div.split.split--left-aside', {}, [
      el('aside.sticky-aside', {}, [
        panel({ title: 'Bộ lọc', titleIcon: 'filter', body: facetSlot }),
        panel({
          title: 'Về thư viện',
          titleIcon: 'info',
          body: el('div.stack-3', {}, [
            el('p.body-text', {},
              'Mọi tài liệu đều do sinh viên tự đóng góp. Hãy ưu tiên chia sẻ tài liệu gốc từ giảng viên để mọi người cùng học.'),
            el('div.divider'),
            el('div.storage-meter', {}, [
              el('div.row-between', {}, [
                el('span.overline', {}, 'Dung lượng phiên bản demo'),
                el('span.caption', {}, '4,2 GB / 10 GB'),
              ]),
              el('div.storage-meter__bar', {}, [
                el('div.storage-meter__fill', {
        style: { '--usage': '42%', '--usage-scale': '0.42' },
      }),
              ]),
            ]),
          ]),
        }),
      ]),
      el('div.stack-5', {}, [
        el('div.toolbar', {}, [
          el('div.toolbar__search', {}, search.node),
          el('div.toolbar__divider'),
          el('div.toolbar__group', {}, [sortSwitch.node]),
        ]),
        summary,
        resultBar,
        grid,
      ]),
    ]),
  ]);

  render(outlet, view);
  await load();

  if (ctx.search?.action === 'share') openShareModal();

  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}

/* -------------------------------------------------------------------------- */
/* Local helpers                                                               */
/* -------------------------------------------------------------------------- */

const COLOR_NAMES = ['brand', 'violet', 'accent', 'signal', 'success', 'danger'];

/** Current user id, read lazily so it stays fresh after a profile update. */
function authAuthorId() {
  return authStore.getState().user?.id ?? null;
}

/** Human label for the active file-type filter. */
function activeTypeLabel(fileType) {
  if (fileType === 'all') return 'Tất cả định dạng';
  return FILE_TYPE_META[fileType]?.label ?? fileType;
}

function formatDateStamp(date) {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}
