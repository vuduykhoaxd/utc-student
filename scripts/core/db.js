/**
 * Mock database
 *
 * Loads a snapshot from localStorage on boot; falls back to the seed dataset.
 * Every mutation goes through `persist()` so state survives a refresh.
 *
 * This is the ONLY module that touches storage directly. When the real
 * backend lands, replace `scripts/core/api.js` and delete this file — nothing
 * else in the app reads storage.
 */

import * as seed from '../data/seed.js';
import { read, write, remove, clearAll } from '../utils/storage.js';

const SNAPSHOT_KEY = 'db-snapshot';
const SCHEMA_VERSION = 3;

/** In-memory working copy of the whole dataset. */
let db = null;

/** Deep clone helper (structuredClone is available in all modern browsers). */
const clone = (value) =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

/** Fresh dataset derived from the seed. */
function buildSeedSnapshot() {
  return {
    version: SCHEMA_VERSION,
    students: seed.students.map((s) => ({ ...s })),
    news: seed.news.map((n) => ({ ...n })),
    events: seed.events.map((e) => ({ ...e })),
    posts: seed.posts.map((p) => ({ ...p })),
    documents: seed.documents.map((d) => ({ ...d })),
    friendships: seed.friendships.map((f) => ({ ...f })),
    conversations: seed.conversations.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m })),
    })),
    notifications: seed.notifications.map((n) => ({ ...n })),
    courses: seed.courses.map((c) => ({ ...c })),
    scheduleSessions: seed.scheduleSessions.map((s) => ({ ...s })),
    exams: seed.exams.map((e) => ({ ...e })),
    createdAt: Date.now(),
  };
}

/** Load (or rebuild) the dataset. Safe to call repeatedly. */
export function load() {
  if (db) return db;

  const snapshot = read(SNAPSHOT_KEY, null);

  if (snapshot && snapshot.version === SCHEMA_VERSION) {
    db = snapshot;
  } else {
    db = buildSeedSnapshot();
    persist();
  }

  return db;
}

/** Write the current dataset back to storage. */
export function persist() {
  if (!db) return;
  db.version = SCHEMA_VERSION;
  write(SNAPSHOT_KEY, db);
}

/** Discard all local state and start over from the seed. */
export function reset() {
  clearAll();
  db = buildSeedSnapshot();
  persist();
}

/** Remove only the auth session. */
export function clearSession() {
  remove('session');
}

/** Read a single collection. */
export function table(name) {
  return load()[name] ?? [];
}

/** Find one row by id. */
export function find(name, id) {
  return table(name).find((row) => row.id === id) ?? null;
}

/** Insert or replace a row. */
export function upsert(name, row) {
  const rows = table(name);
  const index = rows.findIndex((item) => item.id === row.id);
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.push(row);
  persist();
  return rows.find((item) => item.id === row.id);
}

/** Remove a row by id. */
export function removeRow(name, id) {
  const rows = table(name);
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) return false;
  rows.splice(index, 1);
  persist();
  return true;
}

/** Shallow-clone a row so callers cannot mutate the database by reference. */
export function detach(row) {
  return row ? clone(row) : null;
}

/** Clone an array of rows. */
export function detachAll(rows) {
  return clone(rows ?? []);
}

/** Generate a short unique id. */
let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Raw database access for tests / debug tooling. */
export function snapshot() {
  return clone(load());
}

export { seed };