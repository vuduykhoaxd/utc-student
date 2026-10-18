/**
 * Schedule / timetable
 *
 * Desktop shows a real week grid: one row per teaching hour with sessions
 * placed using `grid-row: start / span n`, so a three-hour lab is visibly
 * taller than a 90-minute lecture. Mobile falls back to a day agenda.
 *
 * Also renders exam countdowns, a weekly load chart, and course cards with
 * attendance tracking.
 */

import { el , render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import {
  button,
  panel,
  badge,
  stat,
  emptyState,
  barChart,
  labelledBar,
  progressRing,
  segmented,
} from '../components/ui.js';
import { pageHeader } from '../components/page.js';
import { schedule as scheduleApi } from '../core/api.js';
import { toast } from '../core/app-store.js';
import {
  WEEKDAY_SHORT,
  addDays,
  startOfDay,
  toMinutes,
  schoolDay,
  percent,
} from '../utils/format.js';

/** Palette index -> CSS colour variable name. */
const COLOR_NAMES = ['brand', 'violet', 'accent', 'signal', 'success', 'danger'];

/** Visible hour range of the grid. */
const GRID_START = 7;
const GRID_END = 17;

/** Lunch break boundaries, in minutes since midnight. */
const BREAK_START = 11 * 60 + 30;
const BREAK_END = 12 * 60 + 45;

/**
 * Build the grid row model.
 *
 * One row per teaching hour, plus a single thin lunch-break strip inserted
 * just before the 12:00 row. Sessions are placed with
 * `grid-row: start / span n` against this model, so a three-hour lab is
 * visibly three rows tall and nothing ever bleeds across the break.
 *
 * @returns {Array<{kind: 'hour'|'break', hour?: number, minutes?: number, label?: string}>}
 */
function buildRowModel() {
  const rows = [];

  // The break is inserted before the first hour at or after its end time, so
  // "12:45" puts the strip between the 11:00 and 12:00 rows.
  const breakBeforeHour = Math.ceil(BREAK_END / 60);
  const breakLabel = `Giờ nghỉ trưa · ${clock(BREAK_START)}–${clock(BREAK_END)}`;

  for (let hour = GRID_START; hour <= GRID_END; hour += 1) {
    if (hour === breakBeforeHour) {
      rows.push({ kind: 'break', label: breakLabel });
    }
    rows.push({ kind: 'hour', hour, minutes: hour * 60 });
  }

  return rows;
}

/** Minutes-since-midnight -> "HH:MM". */
function clock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * How many grid rows a session occupies. Never crosses a break row.
 * @param {ReturnType<typeof buildRowModel>} rows
 */
function spanOf(rows, startMinutes, endMinutes) {
  const startIndex = rows.findIndex(
    (row) => row.kind === 'hour' && row.minutes === startMinutes
  );
  if (startIndex < 0) return 1;

  let span = 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (rows[i].kind !== 'hour') break;
    span += 1;
    if (rows[i].minutes >= endMinutes) break;
  }

  return Math.max(1, span);
}

/** Map a school day number (Thứ 2 = 2 … Chủ Nhật = 1) to a Date relative to today. */
function dayFromIso(day) {
  const today = startOfDay(new Date());
  // School days are 1-based with Sunday = 1 and Monday = 2, so a plain
  // difference can overflow the week — normalise it.
  const delta = (((day - schoolDay(today)) % 7) + 7) % 7;
  return addDays(today, delta);
}

/** Narrow viewports get the day agenda instead of the week grid. */
const isCompact = () => window.matchMedia('(max-width: 900px)').matches;

/** @param {HTMLElement} outlet @param {object} ctx - Router context. */
export async function schedulePage(ctx) {
  const outlet = ctx.outlet;
  const term = await scheduleApi.term();

  const state = {
    week: term.currentWeek,
    sessions: [],
    // The week grid is hidden below 900px, so start in day mode there.
    view: isCompact() ? 'day' : 'week',
    day: schoolDay(new Date()),
  };

  const gridSlot = el('div');
  const asideSlot = el('div.sticky-aside');
  const summarySlot = el('div.grid.grid-auto-sm');

  /* ================= Data ================= */

  async function loadWeek() {
    const result = await scheduleApi.getWeek({ week: state.week });
    state.sessions = result.sessions;
    if (state.view === 'day' && !state.sessions.some((s) => s.day === state.day)) {
      state.day = pickTeachingDay(state.sessions);
    }
    draw();
  }

  async function loadDay() {
    let result = await scheduleApi.getDay(dayFromIso(state.day));

    if (!result.sessions.length) {
      // Landing on a free day (e.g. Sunday) — jump to the next teaching day
      const week = await scheduleApi.getWeek({ week: state.week });
      const next = pickTeachingDay(week.sessions);
      if (next !== state.day) {
        state.day = next;
        result = await scheduleApi.getDay(dayFromIso(state.day));
      }
    }

    state.sessions = result.sessions;
    draw();
  }

  /**
   * First day in Mon→Sat order that actually has classes, preferring today or
   * the next one coming up. Falls back to today's school day.
   */
  function pickTeachingDay(sessions) {
    const teaching = [...new Set(sessions.map((s) => s.day))].sort((a, b) => a - b);
    if (!teaching.length) return state.day;
    if (teaching.includes(state.day)) return state.day;
    const today = schoolDay(new Date());
    return teaching.find((d) => d > today) ?? teaching[0];
  }

  function draw() {
    drawGrid();
    drawAside();
    drawSummary();
    updateWeekLabel();
    syncWeekButtons();
  }

  /* ================= Week controls ================= */

  const weekLabel = el('span.term-bar__label');

  function updateWeekLabel() {
    weekLabel.textContent = `Tuần ${state.week} · ${term.name}`;
  }

  const prevBtn = button({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    iconName: 'chevronLeft',
    label: 'Tuần trước',
    ariaLabel: 'Tuần trước',
    onclick: async () => {
      if (state.week <= 1) return;
      state.week -= 1;
      await loadWeek();
    },
  });

  const nextBtn = button({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    iconName: 'chevronRight',
    label: 'Tuần sau',
    ariaLabel: 'Tuần sau',
    onclick: async () => {
      if (state.week >= term.totalWeeks) return;
      state.week += 1;
      await loadWeek();
    },
  });

  function syncWeekButtons() {
    prevBtn.disabled = state.week <= 1;
    nextBtn.disabled = state.week >= term.totalWeeks;
  }

  const viewSwitch = segmented({
    items: [
      { id: 'week', label: 'Cả tuần', iconName: 'calendar' },
      { id: 'day', label: 'Theo ngày', iconName: 'clock' },
    ],
    active: state.view,
    onChange: async (id) => {
      state.view = id;
      viewSwitch.update(id);
      if (id === 'week') await loadWeek();
      else await loadDay();
    },
  });

  const termBar = el('div.term-bar', {}, [
    el('div.term-bar__week', {}, [
      prevBtn,
      weekLabel,
      nextBtn,
      button({
        variant: 'soft',
        size: 'sm',
        label: 'Tuần hiện tại',
        iconName: 'target',
        onclick: async () => {
          state.week = term.currentWeek;
          await (state.view === 'week' ? loadWeek() : loadDay());
        },
      }),
    ]),
    el('div', { style: { flex: 1 } }),
    viewSwitch.node,
  ]);

  /* ================= Grid ================= */

  function drawGrid() {
    render(gridSlot, 
      state.view === 'day' ? dayRail() : weekGrid(),
      state.view === 'day' ? agendaList() : dayRail()
    );
  }

  function weekGrid() {
    const todayIso = schoolDay(new Date());
    const todayDate = startOfDay(new Date());

    const days = term.dayNames.map((label, index) => {
      const iso = index + 2;
      return {
        label,
        short: WEEKDAY_SHORT[iso - 1] ?? '',
        iso,
        date: addDays(todayDate, index + 2 - schoolDay(todayDate)),
      };
    });

    const rows = buildRowModel();

    const grid = el('div.timetable', {
      style: {
        '--days': String(days.length),
        // Row 1 is the sticky header; the rest mirrors the row model exactly so
        // `grid-row: start / span n` lines up with the painted rows.
        gridTemplateRows: [
          'auto',
          ...rows.map((row) => (row.kind === 'break' ? 'var(--break-h)' : 'var(--hour-h)')),
        ].join(' '),
      },
      role: 'grid',
      'aria-label': 'Thời khóa biểu trong tuần',
    });

    /* --- Header row --- */
    grid.appendChild(el('div.tt__corner'));
    days.forEach((day) => {
      grid.appendChild(
        el(
          'div.tt__day',
          { class: day.iso === todayIso ? 'tt__day--today' : '' },
          [
            el('span.tt__day-name', {}, day.short),
            el('span.tt__day-num', {}, String(day.date.getDate())),
          ]
        )
      );
    });

    /* --- Empty cells first, so sessions always paint on top --- */
    rows.forEach((row, index) => {
      const gridRow = String(index + 2); // row 1 is the header

      if (row.kind === 'break') {
        grid.appendChild(el('div.tt__slot.tt__slot--label.tt__slot--break', { style: { gridRow } }));
        days.forEach((day, columnIndex) => {
          // Only the middle column carries the label, so the strip reads as one
          // continuous band rather than six repeated captions.
          const showLabel = row.label && columnIndex === Math.floor(days.length / 2) - 1;
          grid.appendChild(
            el('div.tt__slot.tt__slot--break', {
              style: { gridRow, gridColumn: String(columnIndex + 2) },
            }, showLabel ? el('span.tt__break-label', {}, row.label) : null)
          );
        });
        return;
      }

      grid.appendChild(
        el('div.tt__slot.tt__slot--label', { style: { gridRow } },
          `${String(row.hour).padStart(2, '0')}:00`)
      );

      days.forEach((day, columnIndex) => {
        grid.appendChild(
          el('div.tt__slot', { style: { gridRow, gridColumn: String(columnIndex + 2) } })
        );
      });
    });

    /* --- Sessions --- */
    days.forEach((day, columnIndex) => {
      state.sessions
        .filter((session) => session.day === day.iso)
        .forEach((session) => {
          const startMinutes = toMinutes(session.start);
          const endMinutes = toMinutes(session.end);
          const startRow = rows.findIndex(
            (row) => row.kind === 'hour' && row.minutes === startMinutes
          );
          if (startRow < 0) return;

          const card = sessionCard(session);
          card.style.gridRow = `${startRow + 2} / span ${spanOf(rows, startMinutes, endMinutes)}`;
          card.style.gridColumn = String(columnIndex + 2);
          grid.appendChild(card);
        });
    });

    return el('div', { 'data-reveal': '' }, grid);
  }

  function sessionCard(session) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isToday = session.day === schoolDay(now);
    const start = toMinutes(session.start);
    const end = toMinutes(session.end);

    const isPast = isToday && end < nowMinutes;
    const isNow = isToday && start <= nowMinutes && end >= nowMinutes;

    const compact = session.durationMinutes <= 60;

    return el(
      'button.session',
      {
        class: [
          `course-c${session.colorIndex}`,
          isPast ? 'session--past' : '',
          isNow ? 'session--now' : '',
          compact ? 'session--compact' : '',
        ]
          .filter(Boolean)
          .join(' '),
        type: 'button',
        'aria-label':
          `${session.courseName}, ${session.start} đến ${session.end}, phòng ${session.room}`,
        onclick: () => openSessionSheet(session),
      },
      [
        el('span.session__type', {}, session.type),
        el('span.session__name', {}, session.courseName),
        el('span.session__meta', {}, [icon('mapPin'), el('span', {}, session.room)]),
        compact
          ? null
          : el('span.session__meta', {}, [
              icon('clock'),
              el('span', {}, `${session.start}–${session.end}`),
            ]),
      ]
    );
  }

  /* --- Day rail (mobile picker / desktop quick nav) --- */

  function dayRail() {
    const todayDate = startOfDay(new Date());
    const selectedIso = state.view === 'day' ? state.day : schoolDay(new Date());

    const rail = el('div.day-rail');

    term.dayNames.forEach((label, index) => {
      const iso = index + 2;
      const date = addDays(todayDate, index + 2 - schoolDay(todayDate));
      const dots = state.sessions.filter((session) => session.day === iso);

      rail.appendChild(
        el(
          'button.day-pill',
          {
            type: 'button',
            class: selectedIso === iso ? 'is-active' : '',
            'aria-pressed': String(selectedIso === iso),
            onclick: async () => {
              state.day = iso;
              state.view = 'day';
              viewSwitch.update('day');
              await loadDay();
            },
          },
          [
            el('span.day-pill__name', {}, label),
            el('span.day-pill__num', {}, String(date.getDate())),
            el(
              'span.day-pill__dots',
              {},
              dots.slice(0, 4).map((session) =>
                el('span.day-pill__dot', {
                  style: {
                    '--dot-color': `var(--${COLOR_NAMES[(session.colorIndex - 1) % COLOR_NAMES.length]}-400)`,
                  },
                })
              )
            ),
          ]
        )
      );
    });

    return rail;
  }

  /* --- Day agenda --- */

  function agendaList() {
    if (!state.sessions.length) {
      return el('div.mt-4', {}, emptyState({
        iconName: 'sparkle',
        title: 'Không có tiết học trong ngày',
        message: 'Chọn một ngày khác hoặc chuyển sang chế độ xem cả tuần.',
        action: button({
          label: 'Xem cả tuần',
          variant: 'soft',
          size: 'sm',
          iconName: 'calendar',
          onclick: async () => {
            state.view = 'week';
            viewSwitch.update('week');
            await loadWeek();
          },
        }),
      }));
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isToday = state.day === schoolDay(now);

    return el(
      'div.agenda.mt-4',
      {},
      state.sessions.map((session, index) => {
        const start = toMinutes(session.start);
        const end = toMinutes(session.end);
        const isPast = isToday && end < nowMinutes;
        const isNow = isToday && start <= nowMinutes && end >= nowMinutes;

        return el(
          'div',
          {
            class: [
              'agenda-item',
              `course-c${session.colorIndex}`,
              isPast ? 'agenda-item--past' : '',
              isNow ? 'agenda-item--now' : '',
            ]
              .filter(Boolean)
              .join(' '),
            'data-reveal': 'left',
            style: { '--reveal-delay': `${index * 60}ms` },
            role: 'button',
            tabindex: '0',
            onclick: () => openSessionSheet(session),
            onkeydown: (event) => {
              if (event.key === 'Enter') openSessionSheet(session);
            },
          },
          [
            el('div.agenda-item__time', {}, [
              el('span.agenda-item__start', {}, session.start),
              el('span.agenda-item__end', {}, session.end),
              el('span.agenda-item__dur', {}, `${session.durationMinutes}′`),
            ]),
            el('div.agenda-item__body', {}, [
              el('span.agenda-item__name', {}, session.courseName),
              el('span.agenda-item__teacher', {}, session.teacher),
              el('div.agenda-item__tags', {}, [
                badge({ label: session.type, variant: 'primary' }),
                badge({ label: session.room, variant: 'neutral', iconName: 'mapPin' }),
                isNow ? badge({ label: 'Đang học', variant: 'success', dot: true }) : null,
              ]),
            ]),
          ]
        );
      })
    );
  }

  /* ================= Aside ================= */

  async function drawAside() {
    const [courseList, examList] = await Promise.all([
      scheduleApi.courses(),
      scheduleApi.exams(),
    ]);

    render(asideSlot, 
      panel({
        title: 'Kỳ thi sắp tới',
        titleIcon: 'target',
        body: el('div.stack-2', {}, examList.map((exam, index) => {
          const urgent = exam.daysLeft <= 7;

          return el(
            'div.exam-countdown',
            {
              class: `course-c${exam.colorIndex}`,
              'data-reveal': 'left',
              style: { '--reveal-delay': `${index * 70}ms` },
            },
            [
              el('div.exam-countdown__days', {}, [
                el('span.exam-countdown__num', {}, String(exam.daysLeft)),
                el('span.exam-countdown__unit', {}, 'ngày'),
              ]),
              el('div.stack-1', { style: { minWidth: 0, flex: 1 } }, [
                el('span.truncate', {
                  style: { fontWeight: 700, fontSize: 'var(--text-sm)' },
                }, exam.courseName),
                el('span.caption.truncate', {}, `${exam.type} · ${exam.room}`),
              ]),
              urgent ? badge({ label: 'Sắp', variant: 'danger', pulse: true }) : null,
            ]
          );
        })),
      }),

      panel({
        title: 'Khối lượng học tập',
        titleIcon: 'chart',
        body: barChart({
          data: term.dayNames.map((label, index) => {
            const iso = index + 2;
            const minutes = state.sessions
              .filter((session) => session.day === iso)
              .reduce((sum, session) => sum + session.durationMinutes, 0);

            return {
              label: WEEKDAY_SHORT[iso - 1] ?? label,
              value: Math.round((minutes / 60) * 10) / 10,
              color: `var(--${COLOR_NAMES[index % COLOR_NAMES.length]}-400)`,
              color2: `var(--${COLOR_NAMES[(index + 1) % COLOR_NAMES.length]}-400)`,
            };
          }),
        }),
      }),

      panel({
        title: 'Môn đang học',
        titleIcon: 'book',
        body: el('div.stack-2', {}, courseList.map((course, index) =>
          el(
            'div.course',
            {
              class: `course-c${course.colorIndex}`,
              'data-reveal': 'zoom',
              style: { '--reveal-delay': `${index * 50}ms` },
              role: 'button',
              tabindex: '0',
              onclick: () => openCourseSheet(course),
              onkeydown: (event) => {
                if (event.key === 'Enter') openCourseSheet(course);
              },
            },
            [
              el('div.course__head', {}, [
                el('div.stack-1', { style: { minWidth: 0 } }, [
                  el('span.course__code', {}, course.code),
                  el('span.course__name', {}, course.name),
                ]),
                badge({ label: `${course.credits} TC`, variant: 'neutral' }),
              ]),
              el('div.course__stats', {}, [
                el('div.course__stat', {}, [
                  el('span.course__stat-value', {}, `${course.attendance}%`),
                  el('span.course__stat-label', {}, 'Chuyên cần'),
                ]),
                el('div.course__stat', {}, [
                  el('span.course__stat-value', {}, `${course.attended}/${course.sessions}`),
                  el('span.course__stat-label', {}, 'Buổi'),
                ]),
                el('div.course__stat', {}, [
                  el('span.course__stat-value', {}, course.room),
                  el('span.course__stat-label', {}, 'Phòng'),
                ]),
              ]),
            ]
          )
        )),
      })
    );
  }

  /* ================= Summary ================= */

  function drawSummary() {
    const totalHours = state.sessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60;
    const uniqueCourses = new Set(state.sessions.map((s) => s.courseId)).size;
    const theory = state.sessions.filter((s) => s.type === 'LT').length;
    const practice = state.sessions.filter((s) => s.type === 'TH').length;

    render(summarySlot, 
      stat({
        label: 'Tổng giờ học',
        value: `${totalHours.toFixed(1)}h`,
        iconName: 'clock',
        meta: `Tuần ${state.week}`,
        tint: 'var(--primary-soft)',
      }),
      stat({
        label: 'Môn trong tuần',
        value: uniqueCourses,
        iconName: 'book',
        meta: `${theory} buổi lý thuyết · ${practice} buổi thực hành`,
        tint: 'var(--accent-soft)',
      }),
      stat({
        label: 'Tỉ lệ thực hành',
        value: `${percent(practice, state.sessions.length)}%`,
        iconName: 'settings',
        meta: `${practice} / ${state.sessions.length} buổi`,
        tint: 'var(--violet-soft)',
      }),
      stat({
        label: 'Ngày có học',
        value: new Set(state.sessions.map((s) => s.day)).size,
        iconName: 'calendar',
        meta: term.name,
        tint: 'var(--success-soft)',
      })
    );
  }

  /* ================= Detail sheets ================= */

  async function openSessionSheet(session) {
    const { modal } = await import('../components/overlay.js');

    modal({
      title: session.courseName,
      description: `${session.courseCode} · Buổi ${session.type}`,
      size: 'sm',
      body: [
        el('div.info-grid', {}, [
          infoRow('Thời gian', `${session.start} – ${session.end}`, 'clock'),
          infoRow('Thời lượng', `${session.durationMinutes} phút`, 'timer'),
          infoRow('Phòng học', session.room, 'mapPin'),
          infoRow('Giảng viên', session.teacher, 'user'),
          infoRow('Tuần học', `${session.weekFrom} – ${session.weekTo}`, 'calendar'),
          infoRow('Loại buổi', session.type, 'book'),
        ]),
      ],
      footer: [
        button({
          label: 'Thêm vào lịch cá nhân',
          variant: 'secondary',
          iconName: 'calendar',
          onclick: () =>
            toast({ title: 'Đã thêm vào lịch', message: session.courseName, variant: 'success' }),
        }),
      ],
    });
  }

  async function openCourseSheet(course) {
    const { modal } = await import('../components/overlay.js');

    modal({
      title: course.name,
      description: `${course.code} · ${course.credits} tín chỉ`,
      size: 'sm',
      body: [
        el('div.row-4', { style: { justifyContent: 'center' } }, [
          progressRing({
            percent: course.attendance,
            caption: 'Chuyên cần',
            color: 'var(--success)',
          }),
          el('div.stack-2', {}, [
            el('div.stack-1', {}, [
              el('span.overline', {}, 'Giảng viên'),
              el('strong', {}, course.teacher),
            ]),
            el('div.stack-1', {}, [
              el('span.overline', {}, 'Phòng học chính'),
              el('strong', { style: { fontFamily: 'var(--font-mono)' } }, course.room),
            ]),
          ]),
        ]),
        el('div.divider'),
        el('div.stack-3', {}, [
          el('span.overline', {}, 'Buổi đã tham dự'),
          labelledBar({
            label: `${course.attended}/${course.sessions} buổi`,
            percent: course.attendance,
          }),
        ]),
      ],
      footer: [
        button({
          label: 'Xem tài liệu môn này',
          variant: 'secondary',
          iconName: 'folder',
          onclick: () => {
            window.location.hash = `/documents?course=${course.id}`;
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

  /* ================= Assemble ================= */

  const view = el('div.page', {}, [
    pageHeader({
      eyebrow: 'Học tập',
      eyebrowIcon: 'calendar',
      title: 'Thời khóa biểu',
      subtitle: 'Lịch học theo tuần, điểm danh và các kỳ thi sắp tới.',
      meta: [
        badge({ label: term.name, variant: 'primary', iconName: 'book' }),
        badge({ label: `Tuần ${term.currentWeek}/${term.totalWeeks}`, variant: 'neutral', iconName: 'calendar' }),
      ],
      actions: [
        button({
          label: 'Xuất lịch (ICS)',
          variant: 'secondary',
          iconName: 'download',
          onclick: () =>
            toast({
              title: 'Đã xuất lịch (mô phỏng)',
              message: 'File .ics sẽ được tải xuống khi có backend.',
              variant: 'success',
            }),
        }),
      ],
    }),
    termBar,
    summarySlot,
    el('div.split.split--wide-aside', {}, [gridSlot, asideSlot]),
  ]);

  render(outlet, view);

  await (state.view === 'week' ? loadWeek() : loadDay());
  await drawAside();

  // Switching between a phone and a desktop layout should pick the right view
  let compact = isCompact();
  window.addEventListener(
    'resize',
    () => {
      const next = isCompact();
      if (next === compact) return;
      compact = next;
      state.view = next ? 'day' : 'week';
      viewSwitch.update(state.view);
      (next ? loadDay() : loadWeek());
    },
    { passive: true }
  );

  import('../utils/motion.js').then(({ enhance }) => enhance(view));
}