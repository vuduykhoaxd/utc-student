/**
 * Toast host
 * Mounted once from main.js; subscribes to the UI store and renders the
 * current toast list into a fixed region.
 */

import { el, render } from '../utils/dom.js';
import { icon } from './icons.js';
import { uiStore, dismissToast } from '../core/app-store.js';

const ICON_BY_VARIANT = {
  info: 'info',
  success: 'check',
  error: 'alert',
  warn: 'alert',
};

/** Create the toast host element and bind it to the store. */
export function mountToastHost() {
  const region = el('div.toast-region', {
    role: 'region',
    'aria-label': 'Thông báo',
    'aria-live': 'polite',
  });

  const draw = () => {
    const { toasts } = uiStore.getState();

    render(
      region,
      toasts.map((toast) =>
        el('div', { class: `toast toast--${toast.variant}` }, [
          el('span.toast__icon', {}, icon(ICON_BY_VARIANT[toast.variant] ?? 'info')),
          el('div.toast__content', {}, [
            el('span.toast__title', {}, toast.title),
            toast.message ? el('span.toast__msg', {}, toast.message) : null,
          ]),
          el(
            'button.toast__close',
            {
              type: 'button',
              'aria-label': 'Đóng thông báo',
              onclick: () => dismissToast(toast.id),
            },
            icon('close')
          ),
          toast.duration > 0
            ? el('span.toast__timer', {
                style: { '--toast-duration': `${toast.duration}ms` },
              })
            : null,
        ])
      )
    );
  };

  draw();
  uiStore.subscribe(draw);

  return region;
}