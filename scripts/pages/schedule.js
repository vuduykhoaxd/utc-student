/**
 * Schedule / timetable
 * ---------------------------------------------------------------------------
 * The student's real class timetable, straight from the UTC portal.
 *
 * Week navigation is by offset from today (0 = this week, 1 = next, -1 = last)
 * rather than by academic week number, because the portal takes a date range and
 * has no notion of "week 7 of the term". That also means any week can be opened,
 * including weeks in a previous term.
 *
 * Desktop shows a week grid: one row per teaching hour, with sessions placed
 * using `grid-row: start / span n` so a three-hour lab is visibly taller than a
 * 90-minute lecture. Mobile falls back to a day agenda.
 *
 * When the backend cannot be reached the bundled dataset is used instead, and
 * the page says so — a cancelled class is exactly the case where quietly
 * showing stale data would be the wrong call.
 */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { button, panel, emptyState, segmented, badge } from '../components/ui.js';
import { pageHeader } from '../components/page.js';
import { schedule as scheduleApi } from '../core/api.js';
import { toast } from '../core/app-store.js';
import { WEEKDAY_SHORT, addDays, startOfDay, toMinutes, formatDate } from '../utils/format.js';
import { enhance } from '../utils/motion.js';

/** Visible hour bounds. The actual grid is fitted to the week's data. */
const GRID_START = 7;
const GRID_END = 21;

/** Never fit tighter than this, so a single morning class is not a huge block. */
const MIN_VISIBLE_HOURS = 8;

/** Monday–Sunday. */
const DAYS_SHOWN = 7;

/** Lunch break boundaries, in minutes since midnight. */
const BREAK_START = 11 * 60 + 30;
const BREAK_END = 12 * 60 + 45;

/**
 * Week offsets the picker may reach.
 *
 * Forward stops at the end of the calendar year: the portal has no schedule
 * published past it, and letting the user wander into 2027 only to show an empty
 * grid is worse than not offering it. The backend still answers those weeks, so
 * a deep link degrades to "chưa có dữ liệu" rather than an error.
 */
const PAST_LIMIT = 8;
const FUTURE_LIMIT = () => {
  const now = new Date();
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  const monday = startOfDay(new Date(now));
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Math.max(0, Math.floor((yearEnd - monday) / (7 * 24 * 3600 * 1000)));
};

const isCompact = () => window.matchMedia('(max-width: 900px)').matches;

  /**
   * Row model for the week currently on screen.
   *
   * Every session is positioned against it, so it has to be the same model the
   * grid was built from — hence it is refreshed inside `buildWeekGrid`.
   */
  let rowsCache = [];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** yyyy-MM-dd in local time. Avoids toISOString(), which shifts by timezone. */
function isoDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDay(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Minutes since midnight for "HH:MM". */
function minutesOf(time) {
  const [h, m] = String(time ?? '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Stable colour per subject, so a course keeps its colour across weeks.
 *
 * Returns 1–6 to match the existing `.course-c1` … `.course-c6` classes, which
 * are what actually set the session's tint, border and gradient variables.
 */
function colourFor(subject) {
  const key = String(subject ?? '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (hash % 6) + 1;
}


/**
 * Grid rows: one per teaching hour, plus a lunch strip.
 *
 * Sessions are placed with `grid-row: start / span n` against this model, so a
 * three-hour lab is visibly three rows tall and nothing bleeds across the break.
 */
function buildRowModel(sessions) {
  /**
   * Fit the grid to the week.
   *
   * A fixed 07:00–18:00 window is mostly empty for most students — this one
   * only has two blocks a day — which stretches the page and makes every class
   * look small. Bounds follow the data, with an hour of breathing room and a
   * floor so a single morning class does not become one giant row.
   */
  let first = GRID_END;
  let last = GRID_START;

  for (const session of sessions) {
    const start = minutesOf(session.startTime);
    const end = minutesOf(session.endTime) || start + 45;

    first = Math.min(first, Math.floor(start / 60));
    last = Math.max(last, Math.ceil(end / 60));
  }

  if (first >= last) return buildHourRows(GRID_START, GRID_START + 1, sessions);

  let startHour = Math.max(GRID_START, first - 1);
  let endHour = Math.min(GRID_END, last + 1);

  if (endHour - startHour < MIN_VISIBLE_HOURS) {
    // Grow downward first — a school day starts early and ends late.
    endHour = Math.min(GRID_END, startHour + MIN_VISIBLE_HOURS);
    startHour = Math.max(GRID_START, endHour - MIN_VISIBLE_HOURS);
  }

  return buildHourRows(startHour, endHour, sessions);
}

/** One row per hour, plus the lunch strip when nothing is scheduled across it. */
function buildHourRows(startHour, endHour, sessions) {
  const hours = [];
  let breakPlaced = false;

  /**
   * The lunch strip is only honest if nothing is scheduled across it.
   *
   * A morning class running 09:00–12:00 overlaps 11:30–12:45, and drawing a
   * "lunch" row through it would show a break in the middle of a lecture.
   */
  const overlapsBreak = sessions.some((session) => {
    const start = minutesOf(session.startTime);
    const end = minutesOf(session.endTime) || start + 45;
    return start < BREAK_END && end > BREAK_START;
  });

  for (let h = startHour; h <= endHour; h += 1) {
    // Lunch starts mid-morning, so the strip belongs above the first hour that
    // begins at or after it.
    if (!breakPlaced && !overlapsBreak && h * 60 >= BREAK_START) {
      hours.push({ kind: 'break', minutes: BREAK_START, label: 'Nghỉ trưa' });
      breakPlaced = true;
    }

    hours.push({ kind: 'hour', hour: h });
  }

  return hours;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export async function schedulePage(ctx) {
  const outlet = ctx.outlet;

  const state = {
    /** 0 = this week, 1 = next, -1 = last. */
    weekOffset: 0,
    week: null,
    /** false while loading, then true when live data rendered. */
    live: false,
    /**
     * True once the week is past 31 December.
     *
     * The portal returns an empty result rather than an error there, which would
     * otherwise be indistinguishable from "you have no classes this week".
     */
    beyondTerm: false,
    view: isCompact() ? 'day' : 'week',
    selectedDate: isoDay(new Date()),
  };

  const gridSlot = el('div');
  const asideSlot = el('div.sticky-aside');
  const weekLabel = el('span.term-bar__label');
  const sourceNote = el('span.schedule-source');

  /**
   * Subtitle slot.
   *
   * A node rather than a string because whether the data is live is only known
   * after the first fetch — building the header before that would permanently
   * claim it is sample data.
   */
  const subtitleSlot = el('span');
  const todayBtn = button({
    variant: 'ghost',
    size: 'sm',
    iconName: 'calendar',
    label: 'Tuần này',
    onclick: () => goToWeek(0),
  });

  /* ================= Data ================= */

  /**
   * Load a week.
   *
   * Live data is preferred; the bundled dataset is a fallback so the page still
   * renders something offline or during an outage.
   */
  async function loadWeek() {
    gridSlot.setAttribute('aria-busy', 'true');

    const live = await scheduleApi.getLiveWeek({ weekOffset: state.weekOffset });
    state.live = Boolean(live);

    if (live) {
      state.week = {
        from: live.from,
        to: live.to,
        days: live.days,
      };
      state.beyondTerm = Boolean(live.beyondTerm);
    } else {
      const demo = await scheduleApi.getWeek({ week: 1 });
      state.week = fromDemoSessions(demo.sessions);
      state.beyondTerm = false;
    }

    // Keep the selected day inside the week that just loaded.
    if (!state.week.days.some((d) => d.date === state.selectedDate)) {
      const today = isoDay(new Date());
      state.selectedDate = state.week.days.some((d) => d.date === today)
        ? today
        : (state.week.days.find((d) => d.sessions.length)?.date ?? state.week.from);
    }

    gridSlot.removeAttribute('aria-busy');

    subtitleSlot.textContent = state.live
      ? 'Dữ liệu trực tiếp từ hệ thống quản lý đào tạo UTC'
      : 'Đang hiển thị dữ liệu mẫu — không kết nối được hệ thống nhà trường';

    draw();
  }

  /** Reshape the bundled dataset into the same shape the backend returns. */
  function fromDemoSessions(sessions) {
    const monday = startOfDay(new Date());
    const days = [];

    for (let i = 0; i < 7; i += 1) {
      const date = addDays(monday, i);
      days.push({
        date: isoDay(date),
        weekday: i + 1,
        sessions: [],
      });
    }

    for (const s of sessions) {
      const index = Number(s.day) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 6) continue;

      days[index].sessions.push({
        id: s.id,
        date: days[index].date,
        subject: s.courseName,
        className: '',
        teacher: s.teacher,
        room: s.room,
        startTime: s.start,
        endTime: s.end,
        startPeriod: null,
        endPeriod: null,
        periods: null,
        weekday: index + 1,
      });
    }

    for (const day of days) {
      day.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return {
      from: days[0].date,
      to: days[days.length - 1].date,
      days,
    };
  }

  function goToWeek(offset) {
    const maxForward = FUTURE_LIMIT();

    const clamped = Math.max(-PAST_LIMIT, Math.min(maxForward, offset));
    if (clamped === state.weekOffset) return;

    state.weekOffset = clamped;
    loadWeek();
  }

  /* ================= Draw ================= */

  function draw() {
    updateWeekLabel();
    drawGrid();
    drawAside();

    /**
     * Re-run the reveal observer.
     *
     * Panels and cards are born with `data-reveal`, which starts them at zero
     * opacity until `enhance()` sees them. Nodes added after the first render
     * are never observed, so without this a redrawn panel stays invisible.
     */
    enhance(gridSlot);
    enhance(asideSlot);
  }

  function updateWeekLabel() {
    const from = parseIsoDay(state.week.from);
    const to = parseIsoDay(state.week.to);

    weekLabel.textContent = `${formatDate(from, 'short')} – ${formatDate(to, 'short')}`;

    const offset = state.weekOffset;

    sourceNote.textContent =
      offset === 0 ? 'Tuần này'
        : offset === 1 ? 'Tuần sau'
          : offset === -1 ? 'Tuần trước'
            : offset > 0 ? `Tuần ${offset + 1}`
              : `${Math.abs(offset)} tuần trước`;

    syncNavButtons();
  }

  /** Disable the arrows at the ends of the reachable range. */
  function syncNavButtons() {
    prevBtn.disabled = state.weekOffset <= -PAST_LIMIT;
    nextBtn.disabled = state.weekOffset >= FUTURE_LIMIT();
  }

  const prevBtn = button({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    iconName: 'chevronLeft',
    label: 'Tuần trước',
    ariaLabel: 'Tuần trước',
    onclick: () => goToWeek(state.weekOffset - 1),
  });

  const nextBtn = button({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    iconName: 'chevronRight',
    label: 'Tuần sau',
    ariaLabel: 'Tuần sau',
    onclick: () => goToWeek(state.weekOffset + 1),
  });

  // `segmented` returns a controller, not a node — keep both halves.
  const viewSwitch = segmented({
    active: state.view,
    items: [
      { id: 'week', label: 'Cả tuần' },
      { id: 'day', label: 'Theo ngày' },
    ],
    onChange: (id) => {
      state.view = id;
      viewSwitch.update(id);
      drawGrid();
    },
  });

  /* ---------- Week grid ---------- */

  function drawGrid() {
    gridSlot.replaceChildren(state.view === 'week' ? buildWeekGrid() : buildDayAgenda());
  }

  function buildWeekGrid() {
    const all = state.week.days.flatMap((d) => d.sessions);
    const today = isoDay(new Date());

    if (!all.length) {
      /**
       * Two very different empties. "You have no classes" is alarming and often
       * wrong (a cancelled week, a wrong term); "the school has not published
       * this far ahead" is routine and expected.
       */
      return panel({
        title: 'Thời khóa biểu',
        body: [
          emptyState({
            iconName: state.beyondTerm ? 'calendar' : 'sun',
            title: state.beyondTerm ? 'Chưa có dữ liệu' : 'Không có tiết học',
            message: state.beyondTerm
              ? 'Trường chưa công bố thời khóa biểu cho tuần này. Hãy quay lại tuần hiện tại hoặc chọn tuần khác.'
              : 'Hệ thống nhà trường chưa ghi nhận tiết học nào cho tuần này.',
            action: state.beyondTerm
              ? button({ label: 'Về tuần này', variant: 'secondary', size: 'sm', onclick: () => goToWeek(0) })
              : null,
          }),
        ],
      });
    }

    const rows = buildRowModel(all);
    // Session positioning measures against this same model.
    rowsCache = rows;

    const grid = el('div.timetable', {
      style: {
        '--days': String(DAYS_SHOWN),

        /**
         * Row heights come from the model, not from content.
         *
         * `--hour-h` and `--break-h` are declared on `.timetable` but referenced
         * nowhere in the stylesheet, so without this every row collapses to its
         * text height — a 3-hour lab ends up the same size as a 1-hour lecture.
         */
        gridTemplateRows: [
          'auto',
          ...rows.map((row) => (row.kind === 'break' ? 'var(--break-h)' : 'var(--hour-h)')),
        ].join(' '),
      },
    });
    const lastColumn = DAYS_SHOWN + 1;

    // Every cell is placed explicitly.
    //
    // Grid auto-placement would otherwise run *after* the sessions have been
    // positioned: the spec places definite items first, then fills the gaps, so
    // the time gutter would slide sideways wherever a session occupied a cell.
    grid.append(
      el('div.tt__corner', { style: { gridColumn: '1', gridRow: '1' } })
    );

    for (const day of state.week.days.slice(0, DAYS_SHOWN)) {
      const date = parseIsoDay(day.date);
      const selected = day.date === state.selectedDate;

      grid.append(
        el('button.tt__day', {
          type: 'button',
          class: [day.date === today ? 'tt__day--today' : '', selected ? 'tt__day--selected' : '']
            .filter(Boolean)
            .join(' '),
          style: { gridColumn: String(day.weekday + 1), gridRow: '1' },
          'aria-pressed': String(selected),
          title: `Xem lịch ${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`,
          onclick: () => {
            state.selectedDate = day.date;
            draw();
          },
        }, [
          el('span.tt__day-name', {}, WEEKDAY_SHORT[date.getDay()]),
          el('span.tt__day-num', {}, String(date.getDate())),
          el('span.tt__day-count', {}, day.sessions.length ? `${day.sessions.length} tiết` : '—'),
        ])
      );
    }

    // Body rows: a label gutter cell followed by one empty cell per day.
    rows.forEach((row, index) => {
      const y = index + 2; // row 1 is the header

      const label =
        row.kind === 'break'
          ? el('div.tt__slot.tt__slot--break', { style: { gridColumn: '1', gridRow: String(y) } }, [
              el('span.tt__break-label', {}, row.label),
            ])
          : el('div.tt__slot.tt__slot--label', { style: { gridColumn: '1', gridRow: String(y) } }, [
              el('span', {}, `${String(row.hour).padStart(2, '0')}:00`),
            ]);

      grid.append(label);

      for (let c = 2; c <= lastColumn; c += 1) {
        grid.append(
          el('div.tt__slot', { style: { gridColumn: String(c), gridRow: String(y) } })
        );
      }
    });

    // Sessions sit on the same grid, placed explicitly so a three-hour lab is
    // three rows tall.
    for (const day of state.week.days.slice(0, DAYS_SHOWN)) {
      for (const session of day.sessions) {
        grid.append(positionSession(session, day));
      }
    }

    return grid;
  }

  /** Place one session on the grid. */
  function positionSession(session, day) {
    const startMinutes = minutesOf(session.startTime);
    const endMinutes = minutesOf(session.endTime) || startMinutes + 45;

    // Row 1 is the header, so the model starts at row 2.
    const startIndex = rowIndexFor(rowsCache, startMinutes);
    const endIndex = Math.max(startIndex + 1, rowIndexFor(rowsCache, endMinutes));
    const startRow = startIndex + 1;
    const endRow = endIndex + 1;

    /**
     * Hour rows are only a backdrop. A period-4 class starts at 09:35, so the
     * card is nudged down inside its first row and shortened to its real
     * length instead of pretending to fill 09:00–12:00.
     */
    const row = rowsCache[startIndex - 1];
    const rowStart = row?.kind === 'hour' ? row.hour * 60 : startMinutes;
    const offsetMinutes = Math.max(0, startMinutes - rowStart);
    const durationMinutes = Math.max(15, endMinutes - startMinutes);

    // Column 1 is the time gutter, so day 1 starts at column 2.
    const column = day.weekday + 1;

    const node = el('article.session', {
      class: `course-c${colourFor(session.subject)}`,
      style: {
        gridColumn: String(column),
        gridRow: `${startRow} / ${endRow}`,
        alignSelf: 'start',
        marginTop: `calc(var(--hour-h) * ${(offsetMinutes / 60).toFixed(4)})`,
        height: `calc(var(--hour-h) * ${(durationMinutes / 60).toFixed(4)})`,
      },
      title: [
        session.subject,
        session.room,
        session.teacher,
        `${session.startTime}–${session.endTime}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }, [
      el('span.session__name', {}, session.subject),
      // The grid rows are hourly, so a period-4 class starting at 09:35 would
      // otherwise look identical to one starting at 09:00. The exact window is
      // printed here rather than only in a tooltip.
      el('span.session__meta', {}, [
        icon('clock'),
        el('span', {}, `${session.startTime}–${session.endTime}`),
      ]),
      el('span.session__meta', {}, [
        icon('mapPin'),
        el('span', {}, session.room ?? '—'),
      ]),
    ]);

    if (session.exam) {
      node.append(badge({ label: session.exam, variant: 'danger' }));
    }

    return node;
  }

  /**
   * Row number (1-based, within the body model) for a wall-clock time.
   *
   * Clamped to the visible grid so a class starting at 06:00 or finishing after
   * 17:00 still lands somewhere sensible instead of collapsing the grid.
   */
  function rowIndexFor(rows, minutes) {
    const hour = Math.floor(minutes / 60);

    let index = 0;
    let fallback = 1;

    for (const row of rows) {
      index += 1;
      if (row.kind === 'hour') {
        fallback = index;
        if (row.hour === hour) return index;
      }
    }

    // Before the first hour or after the last: clamp to the nearest edge so the
    // class still lands inside the grid.
    return hour < (rows[0]?.hour ?? hour) ? 1 : fallback;
  }

  /* ---------- Day agenda (mobile) ---------- */

  function buildDayAgenda() {
    const today = isoDay(new Date());
    const day = state.week.days.find((d) => d.date === state.selectedDate);
    const rail = el('div.day-rail');

    for (const d of state.week.days) {
      const date = parseIsoDay(d.date);
      rail.append(
        el('button.day-pill', {
          type: 'button',
          class: d.date === state.selectedDate ? 'is-active' : '',
          onclick: () => {
            state.selectedDate = d.date;
            drawGrid();
          },
        }, [
          el('span.day-pill__name', {}, WEEKDAY_SHORT[date.getDay()]),
          el('span.day-pill__num', {}, String(date.getDate())),
          el('span.day-pill__dots', {}, d.sessions.map(() => el('span.day-pill__dot'))),
        ])
      );
    }

    const list = el('div.day-list');

    if (!day || !day.sessions.length) {
      list.append(
        emptyState({
          iconName: 'sun',
          title: day?.date === today ? 'Hôm nay không có tiết học' : 'Không có tiết học',
          message: state.beyondTerm
            ? 'Trường chưa công bố lịch cho tuần này.'
            : 'Tận dụng ngày nghỉ để ôn tập nhé.',
        })
      );
    } else {
      for (const session of day.sessions) {
        list.append(agendaRow(session, day));
      }
    }

    return el('div', {}, [rail, list]);
  }

  function agendaRow(session, day) {
    const now = new Date();
    const isToday = day.date === isoDay(now);
    const started = isToday && minutesOf(session.startTime) <= now.getHours() * 60 + now.getMinutes();
    const ended = isToday && minutesOf(session.endTime) < now.getHours() * 60 + now.getMinutes();

    const classes = ['agenda-item', `course-c${colourFor(session.subject)}`];
    if (ended) classes.push('session--past');
    else if (started) classes.push('session--now');

    return el('article.agenda-item', { class: classes.join(' ') }, [
      el('div.agenda-item__time', {}, [
        el('strong', {}, session.startTime),
        el('span', {}, session.endTime),
      ]),
      el('div.agenda-item__body', {}, [
        el('span.session__name', {}, session.subject),
        el('span.session__meta', {}, [
          icon('mapPin'),
          el('span', {}, session.room ?? '—'),
        ]),
        session.teacher ? el('span.session__meta', {}, [icon('user'), el('span', {}, session.teacher)]) : null,
      ]),
    ]);
  }

  /* ---------- Aside: the selected day's detail ---------- */

  function drawAside() {
    const day = state.week.days.find((d) => d.date === state.selectedDate);
    const body = [];

    if (day && day.sessions.length) {
      for (const session of day.sessions) {
        body.push(
          el('div.schedule-detail', {}, [
            el('div.schedule-detail__time', {}, `${session.startTime}–${session.endTime}`),
            el('div.schedule-detail__body', {}, [
              el('strong', {}, session.subject),
              session.room ? el('span', {}, session.room) : null,
              session.teacher ? el('span', {}, session.teacher) : null,
            ]),
          ])
        );
      }
    } else {
      body.push(
        emptyState({
          iconName: 'sun',
          title: 'Không có tiết học',
          message: 'Bấm vào một cột ngày ở lưới bên trái để xem chi tiết ngày đó.',
        })
      );
    }

    asideSlot.replaceChildren(panel({ title: 'Lịch trong ngày', body }));
  }

  /* ================= Assemble ================= */

  const view = el('div.page', {}, [
    pageHeader({
      title: 'Thời khóa biểu',
      subtitle: subtitleSlot,
      actions: [
        el('div.term-bar', {}, [
          prevBtn,
          weekLabel,
          nextBtn,
          todayBtn,
          viewSwitch.node,
        ]),
      ],
    }),
    el('div.schedule-layout', {}, [
      el('div.schedule-main', {}, [
        sourceNote,
        gridSlot,
      ]),
      asideSlot,
    ]),
  ]);

  outlet.replaceChildren(view);

  await loadWeek();
}