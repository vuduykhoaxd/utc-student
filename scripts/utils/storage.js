/**
 * Storage
 * Namespaced, quota-safe localStorage wrapper used by the mock API layer.
 */

const PREFIX = 'utc-student:';

/** Namespaced key. */
export const storageKey = (name) => `${PREFIX}${name}`;

/** Read and JSON-parse a value; returns `fallback` when missing or corrupt. */
export function read(name, fallback = null) {
  try {
    const raw = window.localStorage.getItem(storageKey(name));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** JSON-serialise and persist a value. */
export function write(name, value) {
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[storage] write failed:', error?.message);
    return false;
  }
}

/** Remove a single namespaced key. */
export function remove(name) {
  try {
    window.localStorage.removeItem(storageKey(name));
  } catch {
    /* ignore */
  }
}

/** Remove every namespaced key (used by "reset demo data"). */
export function clearAll() {
  try {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Read a raw string value (used for the theme preference). */
export function readRaw(name) {
  try {
    return window.localStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

/** Write a raw string value. */
export function writeRaw(name, value) {
  try {
    window.localStorage.setItem(storageKey(name), value);
  } catch {
    /* ignore */
  }
}