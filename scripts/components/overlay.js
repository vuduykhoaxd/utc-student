/**
 * Overlays: modal, drawer, confirm, lightbox.
 * All of them trap focus, close on Escape / backdrop click, and restore focus
 * to the trigger when they unmount.
 */

import { el, render } from '../utils/dom.js';
import { icon } from './icons.js';
import { button } from './ui.js';


const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The element that had focus when the current overlay opened. */
let lastFocused = null;
let openCount = 0;

/**
 * Open an overlay.
 *
 * @param {object} options
 * @param {'modal'|'drawer'|'centered'} options.variant
 * @param {string} options.size - sm | md | lg | xl | full (modal only)
 * @param {'left'|'right'} options.side - Drawer side.
 * @param {string} [options.className]
 * @param {Function} options.onClose
 * @returns {{close: Function, node: HTMLElement, panel: HTMLElement}}
 */
export function openOverlay({
  variant = 'modal',
  size = 'md',
  side = 'right',
  className = '',
  onClose = () => {},
} = {}) {
  if (openCount === 0) lastFocused = document.activeElement;

  const panel = el('div', {
    class: [
      variant === 'drawer' ? 'drawer' : 'modal',
      variant === 'drawer' ? (side === 'left' ? 'drawer--left' : '') : `modal--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' '),
    role: 'dialog',
    'aria-modal': 'true',
  });

  const backdrop = el('div.overlay', {
    class: [variant === 'drawer' ? 'drawer-overlay' : '', variant === 'centered' ? 'lightbox' : '']
      .filter(Boolean)
      .join(' '),
  }, panel);

  let closed = false;

  function close(result) {
    if (closed) return;
    closed = true;
    openCount = Math.max(0, openCount - 1);

    panel.classList.add('is-closing');
    backdrop.classList.add('is-closing');
    document.removeEventListener('keydown', onKeydown, true);

    const remove = () => {
      backdrop.remove();
      if (openCount === 0) {
        lastFocused?.focus?.();
        lastFocused = null;
        document.body.style.overflow = '';
      }
      onClose(result);
    };

    setTimeout(remove, 200);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(null);
      return;
    }

    if (event.key !== 'Tab') return;

    // Focus trap
    const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null
    );
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close(null);
  });

  document.addEventListener('keydown', onKeydown, true);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  openCount += 1;

  // Focus the first meaningful control after the entry animation begins
  requestAnimationFrame(() => {
    const target =
      panel.querySelector('[data-autofocus]') ?? panel.querySelector(FOCUSABLE);
    target?.focus();
  });

  return { close, panel, backdrop, node: panel };
}

/**
 * Standard modal with header / body / footer.
 *
 * @param {{title: string, description?: string, size?: string, closable?: boolean,
 *          body: Node|Node[], footer?: Node|Node[], onClose?: Function,
 *          className?: string}} options
 */
export function modal({
  title,
  description = '',
  size = 'md',
  closable = true,
  body,
  footer = null,
  onClose = () => {},
  className = '',
}) {
  const overlay = openOverlay({ variant: 'modal', size, className, onClose });
  const { panel, close } = overlay;

  const header = el('header.modal__header', {}, [
    el('div.stack-1', {}, [
      el('h2.modal__title', {}, title),
      description ? el('p.modal__desc', {}, description) : null,
    ]),
    closable
      ? button({
          variant: 'ghost',
          size: 'sm',
          iconOnly: true,
          iconName: 'close',
          label: 'ÄÃ³ng',
          ariaLabel: 'ÄÃ³ng há»™p thoáº¡i',
          onclick: () => close(),
        })
      : null,
  ]);

  const bodyNode = el('div.modal__body', {}, body);

  render(panel, [header, bodyNode, footer ? el('footer.modal__footer', {}, footer) : null]);

  return { close, panel, body: bodyNode, footer: panel.querySelector('.modal__footer') };
}

/**
 * Confirmation dialog. Resolves via the `onClose` callback.
 * @param {{title: string, message: string, confirmLabel?: string,
 *          cancelLabel?: string, variant?: 'danger'|'primary', onConfirm?: Function}} options
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'XÃ¡c nháº­n',
  cancelLabel = 'Huá»· bá»',
  variant = 'danger',
  iconName = 'alert',
  onConfirm = () => {},
}) {
  let confirmed = false;

  const dialog = modal({
    title: '',
    size: 'sm',
    body: [
      el('div.row-4', { style: { alignItems: 'flex-start' } }, [
        el(
          'div.confirm__icon',
          {
            style:
              variant === 'danger'
                ? null
                : { '--confirm-tint': 'var(--primary-soft)', '--confirm-fg': 'var(--primary)' },
          },
          icon(iconName)
        ),
        el('div.stack-2', {}, [
          el('h3.section-title', {}, title),
          el('p.body-text', {}, message),
        ]),
      ]),
    ],
    footer: [
      button({
        label: cancelLabel,
        variant: 'ghost',
        onclick: () => dialog.close('cancel'),
      }),
      button({
        label: confirmLabel,
        variant: variant === 'danger' ? 'danger' : 'primary',
        iconName: 'check',
        onclick: () => {
          confirmed = true;
          dialog.close('confirm');
        },
      }),
    ],
    onClose: (result) => {
      if (confirmed) onConfirm(result);
    },
  });

  return dialog;
}

/**
 * Slide-in drawer.
 * @param {{title: string, side?: 'left'|'right', body: Node|Node[],
 *          footer?: Node|Node[], onClose?: Function}} options
 */
export function drawer({
  title,
  side = 'right',
  body,
  footer = null,
  onClose = () => {},
  width = null,
}) {
  const overlay = openOverlay({
    variant: 'drawer',
    side,
    onClose,
    className: width ? '' : '',
  });
  const { panel, close } = overlay;

  if (width) panel.style.setProperty('--drawer-width', width);

  render(panel, [
    el('header.modal__header', { style: { paddingBottom: 'var(--space-4)' } }, [
      el('h2.modal__title', {}, title),
      button({
        variant: 'ghost',
        size: 'sm',
        iconOnly: true,
        iconName: 'close',
        label: 'ÄÃ³ng',
        ariaLabel: 'ÄÃ³ng',
        onclick: () => close(),
      }),
    ]),
    el('div.modal__body', { style: { flex: '1' } }, body),
    footer ? el('footer.modal__footer', {}, footer) : null,
  ]);

  return { close, panel };
}

/**
 * Image lightbox.
 * @param {string} src
 * @param {string} alt
 */
export function lightbox(src, alt = '') {
  const overlay = openOverlay({ variant: 'centered', onClose: () => {} });
  render(overlay.panel, [el('img.lightbox__img', { src, alt })]);
  return overlay;
}