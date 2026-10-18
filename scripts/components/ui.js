/**
 * UI primitives
 * Reusable presentational building blocks. Pure functions returning DOM nodes.
 */

import { el, svg, $ } from '../utils/dom.js';
import { icon } from './icons.js';
import {
  initials as toInitials,
  formatCompact,
  formatNumber,
  timeAgo,
  cx,
} from '../utils/format.js';

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * @param {{label?: string, iconName?: string, iconAfter?: string, variant?: string,
 *          size?: string, type?: string, disabled?: boolean, loading?: boolean,
 *          block?: boolean, iconOnly?: boolean, onclick?: Function,
 *          className?: string, title?: string, ariaLabel?: string}} props
 */
export function button({
  label = '',
  iconName = null,
  iconAfter = null,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  block = false,
  iconOnly = false,
  onclick = null,
  className = '',
  title = null,
  ariaLabel = null,
} = {}) {
  const classes = [
    'btn',
    'btn--secondary',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    iconOnly ? 'btn--icon' : '',
    loading ? 'btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const node = el('button', {
    class: classes,
    type,
    disabled,
    'aria-label': ariaLabel ?? (iconOnly ? label : null),
    'aria-busy': loading ? 'true' : null,
    title,
    onclick,
  });

  if (iconName) node.appendChild(icon(iconName));
  if (label && !iconOnly) node.appendChild(el('span.btn__label', {}, label));
  if (iconAfter) node.appendChild(icon(iconAfter));

  return node;
}

/** Small square icon button (toolbar, card actions). */
export function quickAction({ iconName, label, onclick, className = '', title = null }) {
  return el(
    'button.quick-action',
    {
      type: 'button',
      class: className,
      'aria-label': label,
      title: title ?? label,
      onclick,
    },
    icon(iconName)
  );
}

/** Quota-style pill used in the topbar for unread items. */
export function quickActionBadged({ iconName, label, count, onclick, className = '' }) {
  const node = el('button.quick-action.quick-action--badged', {
    type: 'button',
    class: className,
    'aria-label': `${label} (${count} chưa đọc)`,
    title: label,
    onclick,
  });
  node.appendChild(icon(iconName));
  if (count > 0) {
    node.appendChild(
      el('span.quick-action__dot', {}, count > 99 ? '99+' : String(count))
    );
  }
  return node;
}

/** Primary / secondary pair used in dialog footers. */
export function buttonGroup(children) {
  return el('div.row-2', {}, children);
}

/* -------------------------------------------------------------------------- */
/* Cards & panels                                                              */
/* -------------------------------------------------------------------------- */

/**
 * @param {{title?: string, titleIcon?: string, actions?: Node[], body?: Node|Node[],
 *          flush?: boolean, className?: string, delay?: number}} props
 */
export function panel({ title = null, titleIcon = null, actions = [], body, flush = false, className = '', delay = 0 } = {}) {
  const node = el('section.panel', {
    class: className,
    'data-reveal': '',
    style: delay ? { '--reveal-delay': `${delay}ms` } : null,
  });

  if (title || actions.length) {
    node.appendChild(
      el(
        'header.panel__header',
        {},
        [
          el('h2.panel__title', {}, [
            titleIcon ? icon(titleIcon) : null,
            el('span', {}, title),
          ]),
          actions.length ? el('div.row-2', {}, actions) : null,
        ]
      )
    );
  }

  node.appendChild(
    el('div.panel__body', { class: flush ? 'panel__body--flush' : '' }, body ?? [])
  );

  return node;
}

/**
 * Statistic tile. Set `data-spotlight` for the pointer-follow glow.
 * @param {{label: string, value: string|number, iconName?: string, meta?: string,
 *          delta?: number, tint?: string, color?: string, countTo?: boolean,
 *          onclick?: Function}} props
 */
export function stat({ label, value, iconName = null, meta = null, delta = null, tint = null, color = null, countTo = false, onclick = null } = {}) {
  const valueNode = el('span.stat__value', {}, String(value));
  if (countTo && typeof value === 'number') {
    valueNode.dataset.countTo = String(value);
    valueNode.textContent = '0';
  }

  const node = el(
    'div.stat',
    {
      class: onclick ? 'stat spotlight' : 'stat',
      'data-reveal': 'zoom',
      style: tint ? { '--stat-tint': tint } : null,
      onclick,
      tabindex: onclick ? '0' : null,
      role: onclick ? 'button' : null,
    },
    [
      el('div.row-between', {}, [
        el('span.stat__label', {}, [
          iconName && el('span.stat__icon', { style: color ? { color } : null }, icon(iconName)),
          el('span', {}, label),
        ]),
        delta !== null &&
          el(
            `span.stat__delta.${delta >= 0 ? 'stat__delta--up' : 'stat__delta--down'}`,
            {},
            [
              icon(delta >= 0 ? 'trending' : 'trending'),
              el('span', {}, `${Math.abs(delta)}%`),
            ]
          ),
      ]),
      valueNode,
      meta ? el('div.stat__meta', {}, meta) : null,
    ]
  );

  return node;
}

/* -------------------------------------------------------------------------- */
/* Badges, chips, tags                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @param {{label: string, variant?: string, iconName?: string, dot?: boolean,
 *          pulse?: boolean, outline?: boolean}} props
 */
export function badge({ label, variant = 'neutral', iconName = null, dot = false, pulse = false, outline = false } = {}) {
  const classes = [
    'badge',
    outline ? 'badge--outline' : `badge--${variant}`,
    dot ? 'badge--dot' : '',
    pulse ? 'badge--pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return el('span', { class: classes }, [
    iconName ? icon(iconName) : null,
    el('span', {}, label),
  ]);
}

/**
 * Filter chip.
 * @param {{label: string, count?: number, active?: boolean, iconName?: string,
 *          removable?: boolean, onclick?: Function, className?: string}} props
 */
export function chip({ label, count = null, active = false, iconName = null, removable = false, onclick = null, className = '' } = {}) {
  const node = el(
    onclick ? 'button.chip' : 'span.chip',
    {
      class: cx(active && 'is-active', className),
      type: onclick ? 'button' : null,
      'aria-pressed': onclick ? String(active) : null,
      onclick,
    },
    [
      iconName ? icon(iconName) : null,
      el('span', {}, label),
      count !== null ? el('span.chip__count', {}, formatNumber(count)) : null,
      removable
        ? el('span.chip__x', { 'aria-hidden': 'true' }, icon('close'))
        : null,
    ]
  );
  return node;
}

/** Monospace course / code tag. */
export function tag({ label, color = null } = {}) {
  return el('span.tag', { style: color ? { '--tag-color': color } : null }, label);
}

/** Coloured square icon container. */
export function iconTile({ iconName, tone = 'primary', size = '', gradient = false } = {}) {
  const tones = {
    primary: ['var(--primary-soft)', 'var(--primary)'],
    accent: ['var(--accent-soft)', 'var(--accent)'],
    signal: ['var(--signal-soft)', 'var(--signal)'],
    violet: ['var(--violet-soft)', 'var(--violet)'],
    danger: ['var(--danger-soft)', 'var(--danger)'],
    success: ['var(--success-soft)', 'var(--success)'],
    info: ['var(--info-soft)', 'var(--info)'],
  };
  const [bg, fg] = tones[tone] ?? tones.primary;

  return el(
    'span.icon-tile',
    {
      class: [size ? `icon-tile--${size}` : '', gradient ? 'icon-tile--gradient' : '']
        .filter(Boolean)
        .join(' '),
      style: gradient ? null : { '--tile-bg': bg, '--tile-fg': fg },
    },
    icon(iconName)
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {{user: object, size?: string, presence?: boolean, ring?: boolean}} props
 */
export function avatar({ user, size = 'md', presence = false, ring = false } = {}) {
  if (!user) {
    return el('span.avatar', { class: `avatar--${size}`, 'aria-hidden': 'true' }, '?');
  }

  const label = toInitials(user.fullName);
  const node = el(
    'span.avatar',
    {
      class: [`avatar--${size}`, ring ? 'avatar--ring' : ''].filter(Boolean).join(' '),
      style: { '--avatar-from': user.avatarFrom, '--avatar-to': user.avatarTo },
      title: user.fullName,
      'aria-label': user.fullName,
    },
    label
  );

  if (presence && user.presence) {
    node.appendChild(el('span', { class: `avatar__presence avatar__presence--${user.presence}` }));
  }

  return node;
}

/** Overlapping avatar row. */
export function avatarStack({ users = [], max = 4, size = 'sm' } = {}) {
  const visible = users.slice(0, max);
  const extra = users.length - visible.length;

  return el(
    'span.avatar-stack',
    {},
    [
      ...visible.map((user) => el('span.avatar-stack__item', {}, avatar({ user, size }))),
      extra > 0
        ? el(
            'span.avatar.avatar-stack__item',
            { class: `avatar--${size} avatar-group__more` },
            `+${extra}`
          )
        : null,
    ]
  );
}

/* -------------------------------------------------------------------------- */
/* Empty & loading states                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {{iconName?: string, title: string, message?: string, action?: Node}} props
 */
export function emptyState({ iconName = 'inbox', title, message = '', action = null } = {}) {
  return el('div.empty-state', {}, [
    el('div.empty-state__icon', {}, icon(iconName)),
    el('div.stack-2', {}, [
      el('h3.section-title', {}, title),
      message ? el('p.body-text', { style: { maxWidth: '32rem' } }, message) : null,
    ]),
    action,
  ]);
}

/** Skeleton placeholder block. */
export function skeleton({ height = '1rem', width = '100%', radius = 'sm' } = {}) {
  return el('div.skeleton', {
    style: { height, width, borderRadius: `var(--radius-${radius})` },
    'aria-hidden': 'true',
  });
}

/** Skeleton card used while a panel loads. */
export function skeletonCard({ lines = 3 } = {}) {
  return el('div.card', { 'aria-hidden': 'true' }, [
    el('div.card__body', {}, [
      skeleton({ height: '1.25rem', width: '40%' }),
      ...Array.from({ length: lines }, (_, i) =>
        skeleton({ height: '0.85rem', width: `${95 - i * 12}%` })
      ),
    ]),
  ]);
}

/** Loading panel placeholder. */
export function loadingPanel({ label = 'Đang tải dữ liệu…' } = {}) {
  return el('div.stack-5', { role: 'status', 'aria-live': 'polite' }, [
    el('div.panel', {}, [
      el('div.panel__body', {}, [
        el('div.row-3', {}, [
          el('div.spinner', { style: { color: 'var(--primary)' } }),
          el('span.caption', {}, label),
        ]),
        el('div.progress-bar'),
      ]),
    ]),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Underlined tab bar with a sliding indicator.
 * @param {{items: Array<{id: string, label: string, iconName?: string, count?: number}>,
 *          active: string, onChange: (id: string) => void, variant?: 'line'|'pill'}} props
 */
export function tabs({ items, active, onChange, variant = 'line' }) {
  const bar = el('div.tabs', {
    class: variant === 'pill' ? 'tabs--pill' : '',
    role: 'tablist',
  });

  const indicator = el('span.tabs__indicator');
  const buttons = new Map();

  items.forEach((item) => {
    const node = el(
      'button.tabs__item',
      {
        type: 'button',
        role: 'tab',
        class: item.id === active ? 'is-active' : '',
        'aria-selected': String(item.id === active),
        onclick: () => onChange(item.id),
      },
      [
        item.iconName ? icon(item.iconName) : null,
        el('span', {}, item.label),
        item.count !== undefined && item.count !== null
          ? el('span.tabs__count', {}, formatNumber(item.count))
          : null,
      ]
    );
    buttons.set(item.id, node);
    bar.appendChild(node);
  });

  if (variant === 'line') bar.appendChild(indicator);

  const move = () => {
    const current = buttons.get(active);
    if (!current || variant === 'pill') return;
    indicator.style.width = `${current.offsetWidth}px`;
    indicator.style.transform = `translateX(${current.offsetLeft}px)`;
  };

  requestAnimationFrame(move);

  return { node: bar, update(nextActive) {
    buttons.forEach((node, id) => {
      const on = id === nextActive;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-selected', String(on));
    });
    active = nextActive;
    requestAnimationFrame(move);
  } };
}

/**
 * Segmented control with a sliding indicator.
 * @param {{items: Array<{id: string, label: string, iconName?: string}>,
 *          active: string, onChange: Function, className?: string}} props
 */
export function segmented({ items, active, onChange, className = '' }) {
  const node = el('div.segmented', { class: className, role: 'tablist' });
  const indicator = el('span.segmented__indicator');
  node.appendChild(indicator);

  const buttons = new Map();

  items.forEach((item) => {
    const btn = el(
      'button.segmented__item',
      {
        type: 'button',
        role: 'tab',
        class: item.id === active ? 'is-active' : '',
        'aria-selected': String(item.id === active),
        onclick: () => onChange(item.id),
      },
      [item.iconName ? icon(item.iconName) : null, el('span', {}, item.label)]
    );
    buttons.set(item.id, btn);
    node.appendChild(btn);
  });

  const move = () => {
    const current = buttons.get(active);
    if (!current) return;
    indicator.style.width = `${current.offsetWidth}px`;
    indicator.style.transform = `translateX(${current.offsetLeft - 3}px)`;
  };

  requestAnimationFrame(move);

  return { node, update(next) {
    buttons.forEach((node, id) => {
      const on = id === next;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-selected', String(on));
    });
    active = next;
    requestAnimationFrame(move);
  } };
}

/* -------------------------------------------------------------------------- */
/* Author meta line                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Avatar + name + time, the standard "who did what, when" row.
 * @param {{user: object, time: string|null, size?: string, presence?: boolean,
 *          extra?: Node|null, onclick?: Function}} props
 */
export function authorRow({ user, time = null, size = 'sm', presence = false, extra = null, onclick = null }) {
  return el(
    el('div.row-2', { style: { minWidth: '0' } }, [
      avatar({ user, size, presence }),
      el(
        'div.stack', { style: { minWidth: 0, gap: '1px' } },
        onclick
          ? el(
              'button',
              {
                type: 'button',
                style: { fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' },
                onclick,
              },
              user?.fullName ?? 'Không rõ'
            )
          : el('span', { style: { fontWeight: 700, fontSize: 'var(--text-sm)' } }, user?.fullName ?? 'Không rõ'),
        time
          ? el(
              'span.caption',
              { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
              [el('span', { style: { display: 'inline-flex' } }, icon('clock')), el('span', {}, time)]
            )
          : null,
      ),
      extra,
    ])
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

/** Inline "N đã đăng ký" style meta. */
export function metaItem({ iconName, text }) {
  return el('span.row-2', { style: { fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' } }, [
    el('span', { style: { display: 'inline-flex' } }, icon(iconName)),
    el('span', {}, text),
  ]);
}

/** Number that abbreviates past 1000. */
export function compactCount(value) {
  return formatCompact(value);
}

/** Relative-time span. */
export function timeAgoSpan(value) {
  return el('span', { title: new Date(value).toLocaleString('vi-VN') }, timeAgo(value));
}

/** Radial progress ring (attendance, profile completion). */
export function progressRing({ percent, caption = '', color = null, size = '4.5rem' } = {}) {
  // Geometry is authored in a 48-unit square, so the viewBox must say so.
  // `svg()` defaults to "0 0 24 24"; left alone, the browser scales this 48-unit
  // artwork *up* into 24 units and the ring renders at 3x, overflowing its box
  // and painting over neighbouring text.
  const box = 48;
  const thickness = 5;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);

  return el(
    'div.ring',
    {
      style: { '--ring-size': size, '--ring-circumference': circumference, '--ring-offset': offset, '--ring-color': color ?? 'var(--primary)' },
      role: 'img',
      'aria-label': `${percent}% ${caption}`,
    },
    [
      svg(
        `
        <circle class="ring__track" cx="${box / 2}" cy="${box / 2}" r="${radius}" stroke-width="${thickness}"/>
        <circle class="ring__progress" cx="${box / 2}" cy="${box / 2}" r="${radius}" stroke-width="${thickness}"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
      `,
        { viewBox: `0 0 ${box} ${box}`, stroke: 'none' }
      ),
      el('span.ring__label', {}, [
        el('span.ring__value', {}, `${percent}%`),
        caption ? el('span.ring__caption', {}, caption) : null,
      ]),
    ]
  );
}

/** Horizontal labelled bar (attendance per course). */
export function labelledBar({ label, percent, from = null, to = null }) {
  return el('div.attend-row', {}, [
    el('div.attend-row__head', {}, [
      el('span.attend-row__name', {}, label),
      el('span', { style: { fontWeight: 700, color: 'var(--text-muted)' } }, `${percent}%`),
    ]),
    el('div.attend-row__bar', {}, [
      el('div.attend-row__fill', {
        style: {
          '--attend': `${percent}%`,
          // Unitless ratio consumed by scaleX() — see `.attend-row__fill`.
          '--attend-scale': String(Math.max(0, Math.min(1, percent / 100))),
          '--attend-from': from ?? 'var(--primary)',
          '--attend-to': to ?? 'var(--accent)',
        },
      }),
    ]),
  ]);
}

/** Vertical bar chart with hover tooltips. */
export function barChart({ data, max = null }) {
  const peak = max ?? Math.max(...data.map((d) => d.value), 1);

  return el(
    'div.chart',
    {},
    data.map((item, index) =>
      el(
        'div.chart__col',
        { 'data-reveal': 'zoom', style: { '--reveal-delay': `${index * 55}ms` } },
        [
          el('div.chart__bar', {
            'data-value': `${item.value}`,
            style: {
              '--h': `${Math.max(4, (item.value / peak) * 100)}%`,
              '--bar-from': item.color ?? 'var(--primary)',
              '--bar-to': item.color2 ?? 'var(--accent)',
              animationDelay: `${index * 55}ms`,
            },
          }),
          el('span.chart__label', {}, item.label),
        ]
      )
    )
  );
}

/** Horizontal filter option row used in the documents sidebar. */
export function filterOption({ label, count, active, onclick }) {
  return el(
    'button.filter-option',
    { type: 'button', class: active ? 'is-active' : '', onclick },
    [
      el('span', {}, label),
      count !== null && count !== undefined
        ? el('span.filter-option__count', {}, formatNumber(count))
        : null,
    ]
  );
}

/** Inline info / warning strip. */
export function notice({ text, variant = 'info', iconName = null }) {
  const defaults = {
    info: ['info', 'var(--info-soft)', 'var(--info)'],
    warn: ['alert', 'var(--signal-soft)', 'var(--signal)'],
    error: ['alert', 'var(--danger-soft)', 'var(--danger)'],
    success: ['check', 'var(--success-soft)', 'var(--success)'],
  };
  const [iconNameResolved, bg, fg] = defaults[variant];

  return el(
    'div.row-3',
    {
      style: {
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: bg,
        color: fg,
        fontSize: 'var(--text-xs)',
        lineHeight: '1.5',
        alignItems: 'flex-start',
      },
    },
    [
      el('span', { style: { display: 'inline-flex', flexShrink: 0, marginTop: '1px' } }, icon(iconName ?? iconNameResolved)),
      el('span', {}, text),
    ]
  );
}

/** Read-only field row used on the profile page. */
export function infoItem({ label, value, iconName = null, mono = false, locked = true }) {
  return el(
    'div.info-item',
    {
      class: locked ? 'info-item--locked' : '',
      title: locked ? 'Thông tin do trường quản lý, không thể chỉnh sửa' : null,
    },
    [
      el('div.info-item__label', {}, [
        iconName ? el('span', { style: { display: 'inline-flex' } }, icon(iconName)) : null,
        el('span', {}, label),
      ]),
      el('span.info-item__value', { class: mono ? 'info-item__value--mono' : '' }, value),
      locked
        ? el('span.info-item__lock', { 'aria-hidden': 'true' }, icon('lock'))
        : null,
    ]
  );
}

/** Scroll a node into view, respecting the sticky header offset. */
export function scrollIntoView(node, offset = 96) {
  if (!node) return;
  const top = node.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/** Focus the first focusable child of a container. */
export function focusFirst(container) {
  const focusable = container?.querySelector(
    'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
  );
  focusable?.focus();
}

/** Close a node when Escape is pressed or a click lands outside it. */
export function dismissible(node, onDismiss, { ignore = '' } = {}) {
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
    }
  };

  const onClick = (event) => {
    if (node.contains(event.target)) return;
    if (ignore && event.target.closest(ignore)) return;
    onDismiss();
  };

  // Defer listener attachment so the opening click does not immediately close it
  setTimeout(() => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick);
  }, 0);

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onClick);
  };
}

/** Small helper for absolute-positioning a popover under an anchor. */
export function anchorTo(popover, anchor, { align = 'end', gap = 8 } = {}) {
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;

  const left =
    align === 'end'
      ? rect.right - width
      : align === 'start'
        ? rect.left
        : rect.left + rect.width / 2 - width / 2;

  popover.style.position = 'fixed';
  popover.style.top = `${rect.bottom + gap}px`;
  popover.style.left = `${Math.max(8, left)}px`;
}

export { $ };