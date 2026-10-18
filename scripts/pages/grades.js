/**
 * Academic results (Kết quả học tập)
 *
 * A transcript for the current term: a sortable table of course marks, the
 * weighted component breakdown behind each mark, and a term summary.
 *
 * The numbers all come from `gradesApi.transcript()`, which recomputes every
 * final mark from its components. This page never derives a mark itself — it
 * only formats what the API returns, so the table, the expandable breakdown
 * and the KPI row can never drift apart.
 */

import { el, render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  badge,
  button,
  emptyState,
  panel,
  progressRing,
  segmented,
  stat,
} from '../components/ui.js';
import { pageHeader, section, split } from '../components/page.js';
import { observeReveals } from '../utils/motion.js';
import { gradesApi } from '../core/api.js';
import { confirmDialog } from '../components/overlay.js';
import { toast } from '../core/app-store.js';
import { formatDate, timeAgo } from '../utils/format.js';

/** Palette index -> CSS colour variable, matching the timetable. */
const COLOR_NAMES = ['brand', 'violet', 'accent', 'signal', 'success', 'danger'];

const COLOR_FOR = (index) => `var(--${COLOR_NAMES[(index ?? 1) - 1] ?? 'brand'}-500)`;

/** Badge variant for each band on the grading scale. */
const TONE = {
  success: 'success',
  primary: 'primary',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
};

/** How a course's mark is rendered once you sort/filter by status. */
const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'final', label: 'Đã chốt' },
  { id: 'provisional', label: 'Đang tạm' },
];

/** Format a mark, or a dash when it has not been marked yet. */
const mark = (value) => (value === null || value === undefined ? '—' : value.toFixed(2));

/** "40% · 9.20" */
const weightLabel = (component) =>
  `${Math.round(component.weight * 100)}% · ${mark(component.score)}`;

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One transcript row. Clicking it toggles the component breakdown inline, so a
 * mark can always be traced back to the assessments behind it.
 */
function transcriptRow({ row, expanded, onToggle, delay }) {
  const { course, final, letter, status } = row;
  const pending = row.components.some((c) => c.score === null);

  const detail = el(
    'tr',
    { class: 'grade__detail-row', style: expanded ? null : { display: 'none' } },
    el(
      'td',
      { colspan: '6' },
      el('div.grade__breakdown', { 'data-reveal': '' }, [
        el('div.grade__breakdown-head', {}, [
          icon('chart'),
          el('span', {}, `Cấu thành điểm ${course?.code ?? ''}`),
          el('span.caption', {}, `· cập nhật ${timeAgo(row.updatedAt)}`),
        ]),
        el(
          'div.grade__components',
          {},
          row.components.map((component) =>
            el('div.grade__component', {}, [
              el('span.grade__component-name', {}, component.name),
              el(
                'span.grade__component-weight',
                { class: `badge badge--${component.score === null ? 'neutral' : 'soft'}` },
                weightLabel(component)
              ),
            ])
          )
        ),
        pending
          ? el('p.caption', { style: { marginTop: 'var(--space-3)' } },
              'Một số đầu điểm chưa được chấm — điểm hiện tại được tính trên phần đã chấm.')
          : null,
      ])
    )
  );

  const main = el(
    'tr',
    {
      class: `grade__row${expanded ? ' is-expanded' : ''}`,
      'data-reveal': '',
      style: { '--reveal-delay': `${delay}ms` },
      tabindex: '0',
      role: 'button',
      'aria-expanded': String(expanded),
      'aria-label': `${course?.name ?? 'Môn học'} — điểm ${mark(final)}`,
      onclick: () => onToggle(row.id),
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(row.id);
        }
      },
    },
    [
      el('td', {}, [
        el('div.grade__course', {}, [
          el('span.grade__dot', { style: { backgroundImage: COLOR_FOR(course?.colorIndex) } }),
          el('div.stack-1', { style: { minWidth: '0' } }, [
            el('span.grade__code', {}, course?.code ?? '—'),
            el('span.grade__name', {}, course?.name ?? 'Môn không xác định'),
          ]),
        ]),
      ]),
      el('td', { class: 'hide-sm' }, course?.teacher ?? '—'),
      el('td', { class: 'grade-table__num' }, String(course?.credits ?? 0)),
      el(
        'td',
        { class: 'grade-table__num' },
        el('span.grade__score', { style: { color: final === null ? undefined : COLOR_FOR(course?.colorIndex) } },
          mark(final))
      ),
      el('td', { class: 'grade-table__num' }, [
        letter
          ? el('span', { class: `badge badge--${TONE[letter.color] ?? 'neutral'}` },
              `${letter.letter} · ${letter.grade}`)
          : el('span.caption', {}, '—'),
      ]),
      el('td', { class: 'grade-table__num' }, [
        status === 'final'
          ? el('span.badge.badge--success', {}, 'Đã chốt')
          : el('span.badge.badge--warning', { title: 'Điểm cuối kỳ chưa chấm' }, 'Tạm tính'),
      ]),
    ]
  );

  return [main, detail];
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export async function gradesPage(ctx) {
  const outlet = ctx.outlet;
  const data = await gradesApi.transcript();

  const state = { filter: 'all', expanded: null };

  const bodySlot = el('div');
  const asideSlot = el('div.stack-4');
  const filterSlot = el('div');

  /* ================= Summary ================= */

  function drawAside() {
    const { summary } = data;

    render(
      asideSlot,
      panel({
        title: 'Tổng hợp học kỳ',
        titleIcon: 'award',
        body: el('div.stack-5', {}, [
          el('div.grade__gauge', {}, [
            progressRing({
              percent: summary.average === null ? 0 : Math.round(summary.average * 10),
              caption: 'điểm TB',
              color: 'var(--accent)',
              size: '6rem',
            }),
            el('div.stack-1', {}, [
              el('span.grade__gauge-value', {}, mark(summary.average)),
              el('span.caption', {}, 'trên thang 10'),
            ]),
          ]),

          el('dl.info-list', {}, [
            el('div.info-list__row', {}, [
              el('dt', {}, 'GPA (4.0)'),
              el('dd', {}, summary.gpa === null ? '—' : summary.gpa.toFixed(2)),
            ]),
            el('div.info-list__row', {}, [
              el('dt', {}, 'Tín chỉ đạt'),
              el('dd', {}, `${summary.credits} / ${summary.totalCredits}`),
            ]),
            el('div.info-list__row', {}, [
              el('dt', {}, 'Môn đạt'),
              el('dd', {}, `${summary.passed} / ${summary.total}`),
            ]),
            el('div.info-list__row', {}, [
              el('dt', {}, 'Đang tạm tính'),
              el('dd', {}, String(summary.outstanding)),
            ]),
          ]),

          summary.strongest
            ? el('div.grade__extreme', {}, [
                el('span.caption', {}, 'Môn điểm cao nhất'),
                el('strong', {}, summary.strongest.course.code),
              ])
            : null,
          summary.weakest
            ? el('div.grade__extreme', {}, [
                el('span.caption', {}, 'Cần cải thiện'),
                el('strong', {}, summary.weakest.course.code),
              ])
            : null,
        ]),
      }),

      panel({
        title: 'Kết quả các học kỳ trước',
        titleIcon: 'layers',
        body: el(
          'div.grade__history',
          {},
          data.history.map((entry) =>
            el('div.grade__history-row', {}, [
              el('div.stack-1', {}, [
                el('span', {}, entry.term),
                el('span.caption', {}, `${entry.credits} tín chỉ · ${entry.standing}`),
              ]),
              el('strong', {}, entry.gpa.toFixed(2)),
            ])
          )
        ),
      }),

      panel({
        title: 'Thang điểm',
        titleIcon: 'info',
        body: el(
          'div.grade__scale',
          {},
          data.scale.map((band) =>
            el('div.grade__scale-row', {}, [
              el('span', { class: `badge badge--${TONE[band.color] ?? 'neutral'}` }, band.letter),
              el('span.caption', {}, band.grade),
              el('span.grade__scale-min', {}, `≥ ${band.min.toFixed(1)}`),
            ])
          )
        ),
      })
    );
  }

  /* ================= Transcript ================= */

  function drawFilters() {
    // `segmented()` returns { node, update } and captures `active` when built,
    // so it is created once and driven through update() afterwards.
    if (!filterSlot.firstChild) {
      render(
        filterSlot,
        segmented({
          items: FILTERS.map((f) => ({ id: f.id, label: f.label })),
          active: state.filter,
          onChange: (id) => {
            if (id === state.filter) return;
            state.filter = id;
            drawFilters();
            drawTable();
          },
        }).node
      );
      return;
    }

    // Rebuild only on first paint; subsequent changes go through update().
    filterSlot.firstChild.querySelectorAll('.segmented__item').forEach((btn) => {
      const on = btn.textContent.trim() === FILTERS.find((f) => f.id === state.filter)?.label;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
  }

  function drawTable() {
    const rows = state.filter === 'all' ? data.rows : data.rows.filter((r) => r.status === state.filter);

    if (!rows.length) {
      render(
        bodySlot,
        emptyState({
          iconName: 'award',
          title: 'Không có môn nào ở bộ lọc này',
          message: 'Chọn bộ lọc khác để xem phần còn lại của bảng điểm.',
        })
      );
      return;
    }

    const toggle = (id) => {
      state.expanded = state.expanded === id ? null : id;
      drawTable();
    };

    const nodes = rows.flatMap((row, index) =>
      transcriptRow({ row, expanded: state.expanded === row.id, onToggle: toggle, delay: Math.min(index * 45, 360) })
    );

    render(
      bodySlot,
      panel({
        title: 'Bảng điểm học kỳ',
        titleIcon: 'award',
        actions: [
          el('span.caption', {}, 'Bấm vào một môn để xem cấu thành điểm'),
        ],
        flush: true,
        body: el('div.table-wrap', {}, [
          el('table.grade-table', {}, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', {}, 'Môn học'),
                el('th.hide-sm', {}, 'Giảng viên'),
                el('th.grade-table__num', {}, 'Tín chỉ'),
                el('th.grade-table__num', {}, 'Điểm'),
                el('th.grade-table__num', {}, 'Xếp loại'),
                el('th.grade-table__num', {}, 'Trạng thái'),
              ]),
            ]),
            el('tbody', {}, nodes),
          ]),
        ]),
      })
    );

    // Expanding or filtering replaces the whole tbody, so the fresh rows need
    // to be registered with the reveal observer again — otherwise they keep
    // `[data-reveal]`'s initial opacity:0 and the table renders blank.
    observeReveals(bodySlot);
  }

  /* ================= Export ================= */

  function exportCsv() {
    const header = ['Ma MH', 'Ten MH', 'Giang vien', 'Tin chi', 'Diem', 'Xep loai', 'Trang thai'];
    const lines = data.rows.map((r) =>
      [
        r.course?.code ?? '',
        r.course?.name ?? '',
        r.course?.teacher ?? '',
        r.course?.credits ?? '',
        r.final === null ? '' : r.final.toFixed(2),
        r.letter?.letter ?? '',
        r.status === 'final' ? 'Da chot' : 'Tam tinh',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );

    // BOM so Excel opens the Vietnamese headers in the right encoding.
    const csv = `﻿${[header.join(','), ...lines].join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = el('a', { href: url, download: `ket-qua-hoc-tap-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast({ title: `Đã xuất ${data.rows.length} môn ra file CSV`, variant: 'success' });
  }

  function print() {
    confirmDialog({
      title: 'In bảng điểm',
      message: 'Bảng điểm sẽ được in ở chế độ chỉ in nội dung, bỏ qua thanh điều hướng.',
      confirmLabel: 'In ngay',
      cancelLabel: 'Huỷ',
      variant: 'primary',
      iconName: 'fileText',
      onConfirm: () => window.print(),
    });
  }

  /* ================= Render ================= */

  drawAside();
  drawFilters();
  drawTable();

  render(
    outlet,
    el('div.page', { 'data-reveal': '' }, [
      pageHeader({
        eyebrow: 'Học tập',
        eyebrowIcon: 'graduation',
        title: 'Kết quả học tập',
        subtitle: `Điểm số ${data.term} — bấm vào từng môn để xem cấu thành điểm.`,
        meta: [
          badge({ label: data.term, variant: 'soft', iconName: 'calendar' }),
          badge({
            label: `${data.summary.passed}/${data.summary.total} môn đạt`,
            variant: 'success',
            iconName: 'check',
          }),
        ],
        actions: [
          button({ label: 'Xuất CSV', iconName: 'download', variant: 'outline', onclick: exportCsv }),
          button({ label: 'In bảng điểm', iconName: 'fileText', variant: 'ghost', onclick: print }),
        ],
      }),

      el('div.grid.grid-auto-sm.mb-5', {}, [
        stat({
          label: 'Điểm trung bình',
          value: mark(data.summary.average),
          iconName: 'chart',
          meta: 'thang 10',
          tint: 'primary',
        }),
        stat({
          label: 'GPA',
          value: data.summary.gpa === null ? '—' : data.summary.gpa.toFixed(2),
          iconName: 'award',
          meta: 'thang 4.0',
          tint: 'violet',
        }),
        stat({
          label: 'Tín chỉ đạt',
          value: `${data.summary.credits}`,
          iconName: 'book',
          meta: `trên ${data.summary.totalCredits}`,
          tint: 'accent',
        }),
        stat({
          label: 'Cập nhật gần nhất',
          // Day + month only — the full dd/mm/yyyy overflows the stat card at
          // the display size.
          value: formatDate(data.rows[0]?.updatedAt ?? new Date(), 'short').slice(0, 5),
          iconName: 'clock',
          meta: timeAgo(data.rows[0]?.updatedAt ?? new Date()),
          tint: 'signal',
        }),
      ]),

      filterSlot,

      split({
        main: [bodySlot],
        aside: [asideSlot],
      }),
    ])
  );

  // This page awaits the API before it renders, so the shell's own `enhance()`
  // has already run against an empty outlet. Wire the motion up here instead.
  const { enhance } = await import('../utils/motion.js');
  enhance(outlet);
}