/**
 * Menu / popover
 * A lightweight dropdown anchored to a trigger, closing on outside click,
 * Escape, or scroll.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * Open a dropdown menu.
 *
 * @param {object} options
 * @param {HTMLElement} options.anchor - Trigger element.
 * @param {Array} options.items - `{label, iconName, onSelect, danger, disabled, shortcut}`.
 * @param {Node} [options.header] - Optional content above the items.
 * @param {'end'|'start'|'center'} [options.align]
 * @param {string} [options.className]
 * @returns {{close: Function, node: HTMLElement}}
 */
export function openMenu({
  anchor,
  items = [],
  header = null,
  align = 'end',
  className = '',
  minWidth = null,
} = {}) {
  const menu = el('div.menu', { class: className, role: 'menu' });
  if (minWidth) menu.style.minWidth = minWidth;

  if (header) menu.appendChild(header);

  items.forEach((item) => {
    if (item.type === 'separator') {
      menu.appendChild(el('div.menu__separator', { role: 'separator' }));
      return;
    }
    if (item.type === 'label') {
      menu.appendChild(el('p.menu__label', {}, item.label));
      return;
    }

    menu.appendChild(
      el(
        'button.menu__item',
        {
          type: 'button',
          role: 'menuitem',
          class: item.danger ? 'menu__item--danger' : '',
          disabled: item.disabled,
          onclick: () => {
            close();
            item.onSelect?.();
          },
        },
        [
          item.iconName ? icon(item.iconName) : null,
          el('span.grow', {}, item.label),
          item.shortcut ? el('span.menu__shortcut', {}, item.shortcut) : null,
        ]
      )
    );
  });

  // Park the node off-screen and hidden before it is measured. Appending a
  // static block first would let it take the body width, which made an
  // `align: 'end'` menu compute a left edge near 0 and slide under the sidebar.
  menu.style.position = 'fixed';
  menu.style.top = '0';
  menu.style.left = '0';
  menu.style.visibility = 'hidden';

  document.body.appendChild(menu);

  // Position after the node is measurable
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;

  const left =
    align === 'end'
      ? rect.right - width
      : align === 'start'
        ? rect.left
        : rect.left + rect.width / 2 - width / 2;

  let top = rect.bottom + 8;

  // Flip above the anchor when there is no room below
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 8);
    menu.style.transformOrigin = 'bottom ' + (align === 'end' ? 'right' : 'center');
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${Math.min(Math.max(8, left), window.innerWidth - width - 8)}px`;
  menu.style.visibility = '';

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onScroll, true);
    anchor.setAttribute('aria-expanded', 'false');
    menu.style.transition = 'opacity 140ms ease, transform 140ms ease';
    menu.style.opacity = '0';
    menu.style.transform += ' translateY(-4px)';
    setTimeout(() => menu.remove(), 140);
  }

  function onPointer(event) {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    close();
  }

  /**
   * Close when the page scrolls, not when the menu scrolls.
   *
   * The listener runs in the capture phase on `window`, so it also sees scroll
   * events from any scrollable descendant — including the menu's own overflow
   * area. Closing on those made a long menu impossible to browse.
   */
  function onScroll(event) {
    if (event.target instanceof Node && (menu.contains(event.target) || anchor.contains(event.target))) {
      return;
    }
    close();
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      anchor.focus?.();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const focusables = Array.from(menu.querySelectorAll('.menu__item:not(:disabled)'));
    if (!focusables.length) return;

    const index = focusables.indexOf(document.activeElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % focusables.length
        : (index - 1 + focusables.length) % focusables.length;

    focusables[next].focus();
  }

  setTimeout(() => {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
  }, 0);

  anchor.setAttribute('aria-expanded', 'true');

  // Focus the first item for keyboard users
  requestAnimationFrame(() => menu.querySelector('.menu__item')?.focus());

  return { close, node: menu };
}

/**
 * A notification-style popover (topbar bell).
 * @param {{anchor: HTMLElement, header: Node, body: Node, width?: string}} options
 */
export function openPopover({ anchor, header, body, width = null }) {
  const popover = el('div.notif-popover', { role: 'dialog' });
  if (width) popover.style.width = width;

  popover.appendChild(header);
  popover.appendChild(body);
  popover.style.position = 'fixed';
  popover.style.top = '0';
  popover.style.left = '0';
  popover.style.visibility = 'hidden';
  document.body.appendChild(popover);

  const rect = anchor.getBoundingClientRect();
  const nodeWidth = popover.offsetWidth;

  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.right - nodeWidth, window.innerWidth - nodeWidth - 8))}px`;
  popover.style.visibility = '';

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onScroll, true);
    anchor.setAttribute('aria-expanded', 'false');
    popover.style.transition = 'opacity 140ms ease, transform 140ms ease';
    popover.style.opacity = '0';
    popover.style.transform = 'translateY(-4px)';
    setTimeout(() => popover.remove(), 140);
  }

  function onPointer(event) {
    if (popover.contains(event.target) || anchor.contains(event.target)) return;
    close();
  }

  /** Ignore scrolls that belong to the popover's own list (see openMenu). */
  function onScroll(event) {
    if (event.target instanceof Node && (popover.contains(event.target) || anchor.contains(event.target))) {
      return;
    }
    close();
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      close();
      anchor.focus?.();
    }
  }

  setTimeout(() => {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
  }, 0);

  anchor.setAttribute('aria-expanded', 'true');

  return { close, node: popover };
}