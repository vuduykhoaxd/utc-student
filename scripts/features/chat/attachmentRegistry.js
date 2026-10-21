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
    enabled: true,
    iconName: 'image',
    description: 'Gửi ảnh chụp màn hình, ảnh chú thích bài học.',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    validate: (payload) => typeof payload?.url === 'string',

    /**
     * Render the image itself, not a placeholder.
     *
     * `objectUrl` is filled in by the page once the blob has been fetched —
     * an <img> cannot carry the session header, so a plain `src` would 401.
     */
    render: (attachment) => {
      const payload = attachment.payload ?? {};

      const media = el('img.attach__img', {
        alt: payload.fileName ?? 'Hình ảnh đính kèm',
        loading: 'lazy',
        // Filled in after the row is rendered, once the blob has been fetched.
        'data-attachment': attachment.id,
      });

      if (payload.objectUrl) media.src = payload.objectUrl;
      // Dimmed until the page hands over the real bytes, so the row does not
      // look broken while the blob is being fetched.
      else media.style.opacity = '0.35';

      return el('div.attach.attach--image', {}, [
        media,
        el('div.attach__text', {}, [
          el('span.attach__name', {}, payload.fileName ?? 'Hình ảnh'),
          el('span.attach__meta', {}, formatBytes(payload.size ?? 0)),
        ]),
      ]);
    },
  },

  /* ---------------------------------------------------------------------- */
  file: {
    label: 'Tệp tin',
    enabled: true,
    iconName: 'paperclip',
    description: 'Gửi tài liệu: PDF, Office, văn bản.',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
    validate: (payload) => typeof payload?.fileName === 'string' && typeof payload?.url === 'string',

    render: (attachment) => {
      const payload = attachment.payload ?? {};

      return el(
        'button.attach.attach--file',
        {
          type: 'button',
          title: `Tải ${payload.fileName}`,
          onclick: () => payload.onDownload?.(attachment),
        },
        [
          el('span.attach__icon', {}, icon('file')),
          el('div.attach__text', {}, [
            el('span.attach__name', {}, payload.fileName ?? 'Tệp đính kèm'),
            el('span.attach__meta', {}, formatBytes(payload.size ?? 0)),
          ]),
          el('span.attach__icon.attach__action', {}, icon('download')),
        ]
      );
    },
  },
};

/**
 * Ordered list of composer tools.
 *
 * Voice notes, GIFs, and calls are deliberately absent rather than present and
 * disabled. A button that says "coming soon" is a promise the app cannot keep,
 * and it makes the ones that do work harder to find.
 */
export const COMPOSER_ORDER = ['emoji', 'image', 'file'];

/** Composer tools, mapped to the kinds above. */
export const COMPOSER_TOOLS = {
  emoji: { iconName: 'smile', label: 'Biểu tượng cảm xúc', kind: 'emoji', enabled: true },
  image: { iconName: 'image', label: 'Gửi hình ảnh', kind: 'image', enabled: true },
  file: { iconName: 'paperclip', label: 'Gửi tệp tin', kind: 'file', enabled: true },
};

/* -------------------------------------------------------------------------- */
/* Public helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Build a text attachment from a raw string. */
export function textAttachment(text) {
  return { id: `att_${Math.random().toString(36).slice(2, 10)}`, kind: 'text', payload: { text } };
}

/**
 * Build an attachment record from what the backend returned.
 *
 * The payload carries the display fields plus the hooks the renderers call, so
 * a renderer never has to reach for the transport itself.
 */
export function fromServer(attachment, hooks = {}) {
  return {
    id: attachment.id,
    kind: attachment.kind === 'image' ? 'image' : 'file',
    payload: {
      url: attachment.url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      objectUrl: null,
      onDownload: hooks.onDownload,
      onLoad: hooks.onLoad,
    },
  };
}

/**
 * Render a single attachment using its registered renderer.
 *
 * The fallback is deliberately neutral rather than a promise: a message saved
 * by a newer client could carry a kind this one has never heard of, and
 * saying "unsupported" is honest where "coming soon" would not be.
 */
export function renderAttachment(attachment) {
  const entry = REGISTRY[attachment.kind];

  if (!entry?.render) {
    return el('div.attach.attach--placeholder', { 'data-kind-label': attachment.kind }, [
      el('span.attach__icon', {}, icon('paperclip')),
      el('div.attach__text', {}, [
        el('span.attach__name', {}, attachment.payload?.fileName ?? entry?.label ?? 'Tệp đính kèm'),
        el('span.attach__meta', {}, 'Loại tệp này chưa được hỗ trợ'),
      ]),
    ]);
  }

  return entry.render(attachment);
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
    if (entry.validate && !entry.validate(attachment.payload)) {
      return { ok: false, error: `Dữ liệu ${entry.label.toLowerCase()} không hợp lệ.` };
    }
  }
  return { ok: true };
}

/**
 * Composer tools that are actually usable.
 *
 * The emoji picker is a text tool, not an attachment kind, so it has no
 * registry entry — it must not be counted as missing.
 */
export function capabilities() {
  return COMPOSER_ORDER.map((key) => {
    const tool = COMPOSER_TOOLS[key];
    const entry = REGISTRY[tool.kind];

    return {
      key,
      label: tool.label,
      iconName: tool.iconName,
      kind: tool.kind,
      enabled: Boolean(tool.enabled && (entry ? entry.enabled : true)),
      description: entry?.description ?? '',
    };
  });
}

/**
 * How many tools are still not usable.
 *
 * The composer no longer lists this anywhere — with every remaining tool
 * working, a "N features coming" line would be pure noise. It stays exported
 * for the README and for tests that assert the registry stays honest.
 */
export const plannedCount = capabilities().filter((c) => !c.enabled).length;

export { formatCompact };