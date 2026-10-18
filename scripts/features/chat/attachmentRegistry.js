/**
 * Chat attachment registry
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * Messages today are plain text. The brief explicitly asks for a structure
 * that can grow into images, voice notes, GIFs and calls without a rewrite.
 *
 * A message therefore already carries a typed `attachments` array:
 *
 *   { id, kind: 'text',  payload: { text } }
 *   { id, kind: 'image', payload: { url, width, height, alt } }
 *   { id, kind: 'voice', payload: { url, durationSec, waveform } }
 *   { id, kind: 'gif',   payload: { url, provider } }
 *   { id, kind: 'file',  payload: { name, size, mimeType, url } }
 *   { id, kind: 'call',  payload: { durationSec, direction, kind: 'voice'|'video' } }
 *
 * Every kind registers:
 *   • `enabled`   — can it be produced right now?
 *   • `render()`  — its visual contract inside a bubble
 *   • `compose()` — how the composer triggers it
 *   • `validate()` — payload shape guard
 *
 * TO ADD A NEW KIND (say `sticker`):
 *   1. add an entry to REGISTRY below,
 *   2. add the matching `.attach--sticker` rule in styles/features/chat.css,
 *   3. done. No renderer, store, or API change is required.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { el } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { formatBytes, formatCompact } from '../../utils/format.js';

/**
 * @typedef {'text'|'image'|'voice'|'gif'|'file'|'call'} AttachmentKind
 */

/** @type {Record<AttachmentKind, object>} */
export const REGISTRY = {
  /* ---------------------------------------------------------------------- */
  text: {
    label: 'Văn bản',
    enabled: true,
    iconName: 'messageCircle',
    description: 'Tin nhắn văn bản thuần.',
    /** Text is rendered from `message.text`, so this only validates. */
    validate: (payload) => typeof payload?.text === 'string',
  },

  /* ---------------------------------------------------------------------- */
  image: {
    label: 'Hình ảnh',
    enabled: false,
    iconName: 'image',
    description: 'Gửi ảnh, thumbnail và tải về bản đầy đủ.',
    future: true,
    validate: (payload) => typeof payload?.url === 'string',
    render: (attachment) =>
      el('div.attach.attach--image', {}, [
        el('span.attach__icon', {}, icon('image')),
        el('div.attach__text', {}, [
          el('span.attach__name', {}, attachment.payload.alt ?? 'Hình ảnh'),
          el('span.attach__meta', {}, 'Tính năng đang phát triển'),
        ]),
      ]),
  },

  /* ---------------------------------------------------------------------- */
  voice: {
    label: 'Tin nhắn thoại',
    enabled: false,
    iconName: 'mic',
    description: 'Ghi âm và gửi tin nhắn thoại.',
    future: true,
    validate: (payload) =>
      typeof payload?.url === 'string' && typeof payload?.durationSec === 'number',
    render: (attachment) =>
      el('div.attach.attach--voice', {}, [
        el('span.attach__icon', {}, icon('mic')),
        el('div.attach__text', {}, [
          el('span.attach__name', {}, `Tin thoại ${attachment.payload.durationSec}s`),
          el('span.attach__meta', {}, 'Tính năng đang phát triển'),
        ]),
        el('span.attach__icon', {}, icon('play')),
      ]),
  },

  /* ---------------------------------------------------------------------- */
  gif: {
    label: 'GIF',
    enabled: false,
    iconName: 'gif',
    description: 'Tra cứu và gửi ảnh GIF.',
    future: true,
    validate: (payload) => typeof payload?.url === 'string',
    render: (attachment) =>
      el('div.attach.attach--gif', {}, [
        el('span.attach__icon', {}, icon('gif')),
        el('div.attach__text', {}, [
          el('span.attach__name', {}, 'GIF'),
          el('span.attach__meta', {}, 'Tính năng đang phát triển'),
        ]),
      ]),
  },

  /* ---------------------------------------------------------------------- */
  file: {
    label: 'Tệp tin',
    enabled: false,
    iconName: 'paperclip',
    description: 'Gửi tệp tin: PDF, Office, ảnh.',
    future: true,
    validate: (payload) => typeof payload?.name === 'string',
    render: (attachment) =>
      el('div.attach.attach--file', {}, [
        el('span.attach__icon', {}, icon('file')),
        el('div.attach__text', {}, [
          el('span.attach__name', {}, attachment.payload.name),
          el('span.attach__meta', {}, formatBytes(attachment.payload.size ?? 0)),
        ]),
      ]),
  },

  /* ---------------------------------------------------------------------- */
  call: {
    label: 'Cuộc gọi',
    enabled: false,
    iconName: 'phone',
    description: 'Gọi thoại và gọi video trong cuộc trò chuyện.',
    future: true,
    system: true,
    validate: (payload) => typeof payload?.durationSec === 'number',
    render: (attachment) =>
      el('div.attach.attach--call', {}, [
        el('span.attach__icon', {}, icon(attachment.payload.kind === 'video' ? 'video' : 'phone')),
        el('div.attach__text', {}, [
          el('span.attach__name', {}, attachment.payload.kind === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'),
          el('span.attach__meta', {}, `${attachment.payload.durationSec}s · Tính năng đang phát triển`),
        ]),
      ]),
  },
};

/** Ordered list of kinds the composer should expose. */
export const COMPOSER_ORDER = ['emoji', 'image', 'voice', 'gif', 'file', 'phone', 'video'];

/** Composer tools, mapped to the kinds above. */
export const COMPOSER_TOOLS = {
  emoji: { iconName: 'smile', label: 'Biểu tượng cảm xúc', kind: 'emoji', enabled: true },
  image: { iconName: 'image', label: 'Gửi hình ảnh', kind: 'image', enabled: false },
  voice: { iconName: 'mic', label: 'Gửi tin nhắn thoại', kind: 'voice', enabled: false },
  gif: { iconName: 'gif', label: 'Gửi GIF', kind: 'gif', enabled: false },
  file: { iconName: 'paperclip', label: 'Gửi tệp tin', kind: 'file', enabled: false },
  phone: { iconName: 'phone', label: 'Gọi thoại', kind: 'call', enabled: false },
  video: { iconName: 'video', label: 'Gọi video', kind: 'call', enabled: false },
};

/* -------------------------------------------------------------------------- */
/* Public helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Build a text attachment from a raw string. */
export function textAttachment(text) {
  return { id: `att_${Math.random().toString(36).slice(2, 10)}`, kind: 'text', payload: { text } };
}

/** Build a stub attachment for any registered kind (used by the demo). */
export function stubAttachment(kind, payload = {}) {
  const entry = REGISTRY[kind];
  if (!entry) throw new Error(`[chat/attachments] Unknown kind: ${kind}`);

  return {
    id: `att_${Math.random().toString(36).slice(2, 10)}`,
    kind,
    payload: { ...payload, __stub: true },
  };
}

/** Render a single attachment using its registered renderer. */
export function renderAttachment(attachment) {
  const entry = REGISTRY[attachment.kind];
  if (!entry?.render) {
    return el('div.attach.attach--placeholder', { 'data-kind-label': attachment.kind }, [
      el('span.attach__icon', {}, icon('paperclip')),
      el('div.attach__text', {}, [
        el('span.attach__name', {}, entry?.label ?? attachment.kind),
        el('span.attach__meta', {}, 'Chưa hỗ trợ'),
      ]),
    ]);
  }

  const node = entry.render(attachment);
  if (attachment.payload?.__stub) node.classList.add('attach--placeholder');
  return node;
}

/** Render every attachment of a message. */
export function renderAttachments(attachments = []) {
  if (!attachments.length) return null;
  return el('div.stack-1', {}, attachments.map(renderAttachment));
}

/** Validate an outgoing attachment list before it reaches the API. */
export function validateAttachments(attachments = []) {
  for (const attachment of attachments) {
    const entry = REGISTRY[attachment.kind];
    if (!entry) {
      return { ok: false, error: `Loại tệp chưa hỗ trợ: ${attachment.kind}` };
    }
    if (!entry.enabled) {
      return { ok: false, error: `${entry.label} đang được phát triển, chưa khả dụng.` };
    }
    if (entry.validate && !entry.validate(attachment.payload)) {
      return { ok: false, error: `Dữ liệu ${entry.label.toLowerCase()} không hợp lệ.` };
    }
  }
  return { ok: true };
}

/** Capability summary, surfaced in the composer tooltip and README. */
export function capabilities() {
  return COMPOSER_ORDER.map((key) => {
    const tool = COMPOSER_TOOLS[key];
    const entry = REGISTRY[tool.kind];
    return {
      key,
      label: tool.label,
      iconName: tool.iconName,
      kind: tool.kind,
      enabled: Boolean(tool.enabled && entry?.enabled),
      description: entry?.description ?? '',
    };
  });
}

/** Number of not-yet-implemented capabilities — shown as a UI hint. */
export const plannedCount = capabilities().filter((c) => !c.enabled).length;

export { formatCompact };