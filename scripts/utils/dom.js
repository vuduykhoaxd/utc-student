/**
 * DOM utilities
 * Tiny hyperscript-style helpers used to build the UI without a framework.
 */

import { revealRendered } from './motion.js';

/**
 * Create an element.
 * @param {string} tag - Tag name, optionally with `.class` and `#id` shorthand.
 * @param {object|null} attrs - Attributes, `class`, `style`, `dataset`, `on*` handlers.
 * @param {Array|string|Node} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = null, children = []) {
  const [tagName, ...classes] = String(tag).split('.');
  const [name, id] = tagName.split('#');
  const node = document.createElement(name || 'div');

  if (id) node.id = id;
  if (classes.length) node.classList.add(...classes);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class' || key === 'className') {
        node.classList.add(...String(value).split(' ').filter(Boolean));
      } else if (key === 'style' && typeof value === 'object') {
        setStyles(node, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(node.dataset, value);
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'ref' && typeof value === 'function') {
        value(node);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(node, children);
  return node;
}

/**
 * Apply a style object to a node.
 * Custom properties (`--foo`) must go through `setProperty` — plain assignment
 * silently does nothing, which would drop every design-token override in the app.
 *
 * @param {HTMLElement} node
 * @param {Record<string, string|number|null|undefined>} styles
 */
export function setStyles(node, styles) {
  for (const [property, value] of Object.entries(styles)) {
    if (value === null || value === undefined || value === false) continue;
    if (property.startsWith('--')) {
      node.style.setProperty(property, String(value));
    } else {
      node.style[property] = value;
    }
  }
  return node;
}

/**
 * Build an inline SVG icon from raw path markup.
 * @param {string} paths - SVG children markup (paths, circles...).
 * @param {object} attrs - Extra SVG attributes.
 */
export function svg(paths, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.75');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  node.innerHTML = paths;
  return node;
}

/** Append any mix of nodes, strings, arrays, or falsy values. */
export function appendChildren(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
  return parent;
}

/** querySelector shorthand. */
export const $ = (selector, scope = document) => scope.querySelector(selector);

/** querySelectorAll shorthand, returned as a real array. */
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/**
 * Replace all children of a node.
 *
 * Accepts either a single array of children or a variadic list, and silently
 * drops `null` / `undefined` / `false` entries — unlike the native
 * `Node.replaceChildren()`, which stringifies them.
 *
 * @param {HTMLElement} node
 * @param {...(Node|string|Array|null|false)} children
 */
export function render(node, ...children) {
  /**
   * An in-place update (filtered list, redrawn panel) replaces nodes that were
   * already revealed. The new nodes carry `data-reveal`, so without releasing
   * them here they stay invisible: the scroll observer only ever saw the old
   * ones. Route mounts (`#view`) are excluded so page transitions still animate.
   */
  const updating = node.isConnected && node.id !== 'view' && node.childElementCount > 0;

  node.replaceChildren();
  appendChildren(node, children);

  if (updating) revealRendered(node);
  return node;
}

/** Add an event listener and return a function that removes it. */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Event delegation: fire when the click lands inside `selector`. */
export function delegate(root, type, selector, handler) {
  return on(root, type, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

/** Toggle a class and return the new state. */
export function toggleClass(node, className, force) {
  return node.classList.toggle(className, force);
}