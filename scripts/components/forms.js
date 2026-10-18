/**
 * Form controls
 * Each factory returns a wrapper node plus handles for reading state,
 * validation, and reset.
 */

import { el, render } from '../utils/dom.js';
import { icon } from './icons.js';
import { cx, percent } from '../utils/format.js';

/**
 * Field wrapper: label + control + hint/error.
 * @param {{label: string, required?: boolean, hint?: string, control: Node,
 *          id: string, errorId?: string, actions?: Node[]}} props
 */
export function field({ label, required = false, hint = '', control, id, errorId = null, actions = [] }) {
  const errorNode = el('p.field__error', { id: errorId, hidden: true });

  const node = el('div.field', {}, [
    label
      ? el('label.field__label', { for: id }, [
          el('span', {}, [label, required ? el('span.req', {}, '*') : null]),
          actions.length ? el('span.row-2', {}, actions) : null,
        ])
      : null,
    control,
    hint ? el('p.field__hint', {}, hint) : null,
    errorNode,
  ]);

  return { node, errorNode };
}

/**
 * Show or clear a field error.
 * @param {{node: HTMLElement, errorNode: HTMLElement, wrapper: HTMLElement}} parts
 */
export function setFieldError(parts, message) {
  const { node, errorNode, wrapper } = parts;

  if (!message) {
    errorNode.hidden = true;
    render(errorNode);
    wrapper?.classList.remove('input--error');
    node.querySelector('input, textarea, select')?.setAttribute('aria-invalid', 'false');
    return;
  }

  render(errorNode, 
    el('span', { style: { display: 'inline-flex' } }, icon('alert')),
    el('span', {}, message)
  );
  errorNode.hidden = false;
  wrapper?.classList.add('input--error');
  node.querySelector('input, textarea, select')?.setAttribute('aria-invalid', 'true');
}

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Text input.
 * @param {{id?: string, name?: string, label?: string, value?: string,
 *          placeholder?: string, iconName?: string, type?: string,
 *          size?: string, required?: boolean, hint?: string, readonly?: boolean,
 *          autofocus?: boolean, autocomplete?: string, maxLength?: number,
 *          onInput?: Function, actions?: Node[], errorId?: string}} props
 */
export function textInput({
  id = `input_${Math.random().toString(36).slice(2, 9)}`,
  name = null,
  label = '',
  value = '',
  placeholder = '',
  iconName = null,
  type = 'text',
  size = '',
  required = false,
  hint = '',
  readonly = false,
  autofocus = false,
  autocomplete = null,
  maxLength = null,
  onInput = null,
  actions = [],
  errorId = null,
} = {}) {
  const input = el('input.input__el', {
    id,
    name,
    type,
    value,
    placeholder,
    disabled: readonly,
    required,
    autocomplete,
    maxlength: maxLength,
    'data-autofocus': autofocus ? '' : null,
    'aria-invalid': 'false',
    readonly,
  });

  if (onInput) {
    input.addEventListener('input', () => onInput(input.value, input));
  }

  const wrapper = el(
    'div.input',
    {
      class: [
        iconName ? 'input--icon' : '',
        size ? `input--${size}` : '',
        readonly ? 'input--readonly' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    [
      iconName ? el('span.input__icon', {}, icon(iconName)) : null,
      input,
      actions.length ? el('div.input__action', {}, actions) : null,
    ]
  );

  const parts = { node: wrapper, input, errorNode: null };

  if (!label && !hint) {
    return { ...parts, wrapper };
  }

  const fieldParts = field({ label, required, hint, control: wrapper, id, errorId, actions: [] });
  const result = {
    node: fieldParts.node,
    wrapper,
    input,
    errorNode: fieldParts.errorNode,
    focus: () => input.focus(),
    setError: (message) => {
      setFieldError({ ...fieldParts, wrapper }, message);
    },
    clearError: () => {
      setFieldError({ ...fieldParts, wrapper }, null);
    },
    get value() {
      return input.value;
    },
    set value(next) {
      input.value = next;
    },
  };

  return result;
}

/**
 * Textarea with an optional live character counter.
 * @param {{id?: string, label?: string, value?: string, placeholder?: string,
 *          rows?: number, maxLength?: number, hint?: string, required?: boolean,
 *          onInput?: Function}} props
 */
export function textarea({
  id = `textarea_${Math.random().toString(36).slice(2, 9)}`,
  label = '',
  value = '',
  placeholder = '',
  rows = 4,
  maxLength = null,
  hint = '',
  required = false,
  onInput = null,
} = {}) {
  const node = el('textarea.textarea', {
    id,
    value,
    placeholder,
    rows,
    maxlength: maxLength,
    required,
    'aria-invalid': 'false',
  });

  let counter = null;
  if (maxLength) {
    const fill = el('span.counter__fill');
    const text = el('span.counter__text');
    const bar = el('div.counter__bar', {}, fill);
    counter = { root: el('div.counter', {}, [bar, text]), fill, text, bar };

    const update = (next) => {
      const ratio = percent(next.length, maxLength);
      fill.style.setProperty('--counter-progress', `${ratio}%`);
      text.textContent = `${next.length}/${maxLength}`;
      counter.root.classList.toggle('counter--warn', ratio >= 80 && ratio < 100);
      counter.root.classList.toggle('counter--over', ratio >= 100);
    };

    update(value);
    node.addEventListener('input', () => update(node.value));
  }

  const handle = () => {
    onInput?.(node.value, node);
  };
  node.addEventListener('input', handle);

  const wrapper = el('div.stack-2', {}, [node, counter?.root ?? null]);
  const fieldParts = field({
    label,
    required,
    hint,
    control: wrapper,
    id,
  });

  return {
    node: fieldParts.node,
    wrapper: node,
    element: node,
    errorNode: fieldParts.errorNode,
    focus: () => node.focus(),
    setError: (message) => setFieldError({ ...fieldParts, wrapper: node }, message),
    clearError: () => setFieldError({ ...fieldParts, wrapper: node }, null),
    get value() {
      return node.value;
    },
  };
}

/**
 * Native select styled to match the design system.
 * @param {{id?: string, label?: string, value?: string, required?: boolean,
 *          hint?: string, options: Array<{value: string, label: string, disabled?: boolean}>,
 *          onChange?: Function}} props
 */
export function select({
  id = `select_${Math.random().toString(36).slice(2, 9)}`,
  label = '',
  value = '',
  required = false,
  hint = '',
  options = [],
  onChange = null,
} = {}) {
  const native = el(
    'select',
    { id, required },
    options.map((option) =>
      el(
        'option',
        { value: option.value, disabled: option.disabled ?? false },
        option.label
      )
    )
  );

  native.value = value || options[0]?.value || '';

  if (onChange) native.addEventListener('change', () => onChange(native.value));

  const wrapper = el('div.select', {}, [
    native,
    el('span.select__arrow', {}, icon('chevronDown')),
  ]);

  const fieldParts = field({ label, required, hint, control: wrapper, id });

  return {
    node: fieldParts.node,
    wrapper,
    element: native,
    errorNode: fieldParts.errorNode,
    setError: (message) => setFieldError({ ...fieldParts, wrapper }, message),
    clearError: () => setFieldError({ ...fieldParts, wrapper }, null),
    get value() {
      return native.value;
    },
    set value(next) {
      native.value = next;
    },
  };
}

/**
 * Checkbox or radio.
 * @param {{id?: string, label?: string, name?: string, checked?: boolean,
 *          variant?: 'checkbox'|'radio', onChange?: Function}} props
 */
export function checkbox({
  id = `check_${Math.random().toString(36).slice(2, 9)}`,
  label = '',
  name = null,
  checked = false,
  variant = 'checkbox',
  onChange = null,
} = {}) {
  const input = el('input', {
    id,
    name,
    type: variant === 'radio' ? 'radio' : 'checkbox',
    checked,
  });

  if (onChange) input.addEventListener('change', () => onChange(input.checked));

  const node = el('label.checkbox', { class: variant === 'radio' ? 'checkbox--radio' : '' }, [
    input,
    el('span.checkbox__box', {}, icon(variant === 'radio' ? '' : 'check')),
    el('span', {}, label),
  ]);

  return { node, input, get checked() { return input.checked; } };
}

/**
 * Toggle switch.
 * @param {{id?: string, label?: string, checked?: boolean, onChange?: Function}} props
 */
export function switchToggle({
  id = `switch_${Math.random().toString(36).slice(2, 9)}`,
  label = '',
  checked = false,
  onChange = null,
} = {}) {
  const input = el('input', { id, type: 'checkbox', checked });
  if (onChange) input.addEventListener('change', () => onChange(input.checked));

  const node = el('label.switch', { for: id }, [
    input,
    el('span.switch__track', {}, el('span.switch__thumb')),
    label ? el('span', { style: { fontSize: 'var(--text-sm)' } }, label) : null,
  ]);

  return { node, input, get checked() { return input.checked; } };
}

/**
 * Search field with a leading magnifier.
 * @param {{id?: string, placeholder?: string, value?: string, autofocus?: boolean,
 *          onInput?: (value: string) => void}} props
 */
export function searchInput({
  id = `search_${Math.random().toString(36).slice(2, 9)}`,
  name = 'search',
  placeholder = 'Tìm kiếm…',
  value = '',
  autofocus = false,
  onInput = null,
} = {}) {
  const input = el('input', {
    id,
    name,
    type: 'search',
    value,
    placeholder,
    autocomplete: 'off',
    'data-autofocus': autofocus ? '' : null,
    'aria-label': placeholder,
  });

  const debounce = onInput ? debounceFn(onInput, 180) : null;
  input.addEventListener('input', () => debounce?.(input.value));

  const node = el('div.search', {}, [
    el('span.search__icon', {}, icon('search')),
    input,
  ]);

  return {
    node,
    input,
    focus: () => input.focus(),
    clear: () => {
      input.value = '';
      onInput?.('');
    },
    get value() {
      return input.value;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Dropzone                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Drag-and-drop file picker.
 * @param {{accept?: string, multiple?: boolean, hint?: string,
 *          onFiles: (files: File[]) => void}} props
 */
export function dropzone({ accept = '', multiple = false, hint = '', onFiles } = {}) {
  const input = el('input', {
    type: 'file',
    accept,
    multiple,
    hidden: true,
    onchange: (event) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) onFiles(files);
      event.target.value = '';
    },
  });

  const node = el(
    'div.dropzone',
    {
      role: 'button',
      tabindex: '0',
      onclick: () => input.click(),
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      },
    },
    [
      el('div.dropzone__icon', {}, icon('upload')),
      el('div.stack-1', { style: { alignItems: 'center' } }, [
        el('span', { style: { fontWeight: 700, fontSize: 'var(--text-sm)' } }, 'Kéo thả tệp vào đây'),
        el('span.caption', {}, hint || 'hoặc nhấn để chọn từ máy tính'),
      ]),
      input,
    ]
  );

  let depth = 0;
  node.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth += 1;
    node.classList.add('is-dragging');
  });
  node.addEventListener('dragover', (event) => event.preventDefault());
  node.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) node.classList.remove('is-dragging');
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    node.classList.remove('is-dragging');
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  });

  return { node, input };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Trailing-edge debounce. */
export function debounceFn(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Collect values from a form root. */
export function readForm(root) {
  const data = {};
  root.querySelectorAll('input, textarea, select').forEach((node) => {
    if (!node.name && !node.id) return;
    const key = node.name || node.id;
    if (node.type === 'checkbox') data[key] = node.checked;
    else data[key] = node.value;
  });
  return data;
}

export { cx };