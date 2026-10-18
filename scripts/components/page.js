/**
 * Page scaffolding
 * Shared page-level layout helpers used by every route.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * Page header block.
 * @param {{eyebrow?: string, eyebrowIcon?: string, title: string,
 *          subtitle?: string, actions?: Node[], meta?: Node[]}} props
 */
export function pageHeader({ eyebrow = '', eyebrowIcon = null, title, subtitle = '', actions = [], meta = [] } = {}) {
  return el('div.page__head', { 'data-reveal': '' }, [
    el('div.page__heading', {}, [
      eyebrow
        ? el('span.page__eyebrow', {}, [eyebrowIcon ? icon(eyebrowIcon) : null, el('span', {}, eyebrow)])
        : null,
      el('h1.page-title', {}, title),
      subtitle ? el('p.body-text', {}, subtitle) : null,
      meta.length ? el('div.row-3.row-wrap.mt-2', {}, meta) : null,
    ]),
    actions.length ? el('div.page__actions', {}, actions) : null,
  ]);
}

/**
 * Section wrapper with an optional heading row.
 * @param {{title?: string, titleIcon?: string, actions?: Node[], children: Node|Node[],
 *          className?: string}} props
 */
export function section({ title = '', titleIcon = null, actions = [], children, className = '' } = {}) {
  return el('section.section', { class: className }, [
    title || actions.length
      ? el('div.section__head', {}, [
          title
            ? el('h2.section-title.row-2', {}, [titleIcon ? icon(titleIcon) : null, el('span', {}, title)])
            : el('span'),
          actions.length ? el('div.row-2.row-wrap', {}, actions) : null,
        ])
      : null,
    children,
  ]);
}

/**
 * Standard page container.
 * @param {Node|Node[]} children
 */
export function page(children, className = 'page') {
  return el('div', { class: className }, children);
}

/**
 * Back link, used by detail routes.
 * @param {{href: string, label: string, onclick?: Function}} props
 */
export function backLink({ href, label = 'Quay lại', onclick = null }) {
  return el(
    'a.back-link',
    { href: href.startsWith('#') ? href : `#${href}`, onclick },
    [icon('arrowLeft'), el('span', {}, label)]
  );
}

/**
 * Two-column layout: main content + sticky aside.
 * @param {{main: Node|Node[], aside: Node|Node[], variant?: string}} props
 */
export function split({ main, aside, variant = '' }) {
  return el('div.split', { class: variant }, [
    el('div.stack-5', {}, main),
    el('aside.sticky-aside', {}, aside),
  ]);
}

/**
 * Standard "load more" affordance for long lists.
 * @param {{shown: number, total: number, onClick: Function, label?: string}} props
 */
export function loadMore({ shown, total, onClick, label = 'Xem thêm' }) {
  if (shown >= total) {
    return el('div.caption.center-content', { style: { padding: 'var(--space-4)' } },
      `Đã hiển thị tất cả ${total} kết quả.`);
  }

  return el('div.center-content', { style: { paddingTop: 'var(--space-4)' } },
    el('button.btn.btn--secondary', { type: 'button', onclick: onClick },
      `${label} (${total - shown} mục còn lại)`));
}