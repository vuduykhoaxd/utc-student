/**
 * Realtime client
 * ---------------------------------------------------------------------------
 * A thin wrapper over the backend's Socket.IO hub.
 *
 * The socket is a shared singleton: several pages listen at once (the chat page
 * for messages, the feed for posts, the sidebar for notifications), and
 * opening one connection per listener would multiply traffic for no gain.
 *
 * Nothing here decides what an event means — it only delivers it. Pages
 * subscribe to named events and update their own state, so adding a new event
 * never requires touching this file.
 *
 * Self-healing is the important part. A single failed attempt at boot (the
 * backend was restarting, the laptop woke from sleep) used to leave the app
 * silently one-way until the user reloaded. Everything here exists so that the
 * connection comes back on its own, and so a page opened later can heal a dead
 * socket just by subscribing.
 *
 * The Socket.IO script is loaded from the backend's own `/realtime/` path, so
 * there is no CDN dependency and no version skew between client and server.
 */

import { BASE_URL } from './config.js';

/** Server -> client event names, mirroring `Realtime.EVENTS` on the backend. */
export const REALTIME_EVENTS = {
  READY: 'ready',
  FRIEND_REQUEST: 'friend:request',
  FRIEND_ACCEPTED: 'friend:accepted',
  FRIEND_REMOVED: 'friend:removed',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CHAT_READ: 'chat:read',
  CHAT_CONVERSATION: 'chat:conversation',
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_REMOVED: 'post:removed',
  COMMENT_ADDED: 'comment:added',
  DOCUMENT_CREATED: 'document:created',
  DOCUMENT_UPDATED: 'document:updated',
  DOCUMENT_REMOVED: 'document:removed',
  NOTIFICATION: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  PRESENCE: 'presence:changed',
};

/** Event telling the app the connection just came back, after a gap. */
export const RECONNECTED = '__reconnected';

const SESSION_KEY = 'utc:session';

/** Retry backoff bounds. Long enough not to hammer, short enough to feel live. */
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10000;

let socket = null;
let loading = null;

/** In-flight `connect()`, so concurrent callers share one attempt. */
let connecting = null;

let retryTimer = null;
let retryDelay = RETRY_MIN_MS;

/** True once we have ever connected, so we can report "came back". */
let hasConnected = false;

let onlineBound = false;

/** event -> Set<handler> */
const listeners = new Map();

function currentToken() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Load the Socket.IO browser bundle once.
 *
 * Resolves to null when the backend is unreachable. A failure is not cached, so
 * the next attempt injects the script again rather than inheriting the outage
 * for the rest of the session.
 */
function loadClient() {
  if (window.io) return Promise.resolve(window.io);
  if (loading) return loading;

  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `${BASE_URL}/realtime/socket.io.js`;
    script.async = true;

    script.onload = () => resolve(window.io ?? null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  }).then((io) => {
    if (!io) loading = null;
    return io;
  });

  return loading;
}

/** Queue another attempt, backing off so a dead backend is not hammered. */
function scheduleRetry() {
  if (retryTimer) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    // A new token may have arrived in the meantime, or the user may have signed
    // out; `connect` re-checks both.
    connect().catch(() => {});
  }, retryDelay);

  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

/** Stop retrying — the connection is up, or the user signed out. */
function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = RETRY_MIN_MS;
}

/**
 * Open the connection, or return the live one.
 *
 * Safe to call repeatedly and from anywhere: concurrent callers share one
 * attempt, and a failure schedules its own retry rather than leaving the app
 * one-way.
 *
 * Returns null rather than throwing when the backend is unreachable — realtime
 * is an enhancement, and a page must still work over plain REST.
 */
export async function connect() {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  const token = currentToken();
  if (!token) return null;

  connecting = (async () => {
    const io = await loadClient();
    if (!io) {
      // The script itself failed — the backend is down or unreachable.
      scheduleRetry();
      return null;
    }

    // A previous attempt may have left a socket that never came up; reusing it
    // would hand back a dead object.
    if (socket) {
      socket.removeAllListeners();
      socket.close();
      socket = null;
    }

    // The token may have changed while the script was loading.
    const live = io(BASE_URL, {
      path: '/realtime',
      // The backend reads the token from this, not from a query string, so it
      // never lands in a proxy access log.
      auth: { token: currentToken() ?? token },
      transports: ['websocket', 'polling'],
      // Keep trying forever: the backend restarting is normal in development,
      // and giving up is exactly what forces the user to reload.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      timeout: 8000,
    });

    socket = live;

    /**
     * Deliver to every registered handler.
     *
     * Handlers live in this module rather than on the socket, so a socket that
     * is replaced on reconnect would otherwise leave the app's subscriptions
     * attached to nothing.
     */
    live.onAny((event, payload) => {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.warn(`[realtime] handler lỗi cho "${event}"`, error);
        }
      }
    });

    live.on('connect', () => {
      clearRetry();

      // Tell the app to catch up on anything it missed while the socket was
      // down. Without this, messages sent in the gap would be invisible until
      // the user navigated.
      if (hasConnected) emit(RECONNECTED);
      hasConnected = true;
    });

    live.on('disconnect', (reason) => {
      // A deliberate `disconnect()` is not an outage, so it must not spin up a
      // retry loop for a socket we are about to throw away.
      if (reason !== 'io client disconnect') scheduleRetry();
    });

    live.on('connect_error', () => {
      // Socket.IO retries on its own; this covers the case where it gives up,
      // and the case where the very first handshake never completed.
      if (!live.active && !socket?.connected) scheduleRetry();
    });

    live.on('error', () => {
      if (!live.connected) scheduleRetry();
    });

    return live;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/** Reconnect as soon as the browser reports the network is back. */
function bindOnlineListener() {
  if (onlineBound) return;
  onlineBound = true;

  window.addEventListener('online', () => {
    // The socket may still believe it is connected while the socket is
    // actually dead, so force a fresh attempt rather than trusting `connected`.
    if (!socket?.connected) {
      retryDelay = RETRY_MIN_MS;
      connect().catch(() => {});
    }
  });
}

/**
 * Subscribe to a server event. Returns an unsubscribe function.
 *
 * Also nudges the connection: a page opened after a failed attempt should not
 * have to wait for the next retry tick to start receiving events.
 */
export function on(event, handler) {
  if (typeof handler !== 'function') return () => {};

  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);

  bindOnlineListener();
  connect().catch(() => {});

  return () => off(event, handler);
}

/** Subscribe for exactly one delivery. */
export function once(event, handler) {
  const wrapped = (payload) => {
    off(event, wrapped);
    handler(payload);
  };
  return on(event, wrapped);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/** Dispatch to the handlers registered in this module. */
function emit(event, payload) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (error) {
      console.warn(`[realtime] handler lỗi cho "${event}"`, error);
    }
  }
}

/** Tell the others in a conversation that the user is typing. */
export function sendTyping(conversationId, typing = true) {
  socket?.emit('chat:typing', { conversationId, typing });
}

/** True when a live connection is established. */
export function isConnected() {
  return Boolean(socket?.connected);
}

/**
 * Close the connection and drop every handler.
 *
 * Called on sign-out: leaving the socket up would keep delivering the previous
 * student's events to whoever signs in next on this browser. The retry loop is
 * cleared too, or it would immediately reconnect with the new token and undo
 * the sign-out.
 */
export async function disconnect() {
  listeners.clear();
  clearRetry();
  hasConnected = false;

  const live = socket;
  socket = null;

  if (live) {
    live.removeAllListeners();
    live.disconnect();
  }
}