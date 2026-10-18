/**
 * User preferences
 *
 * A small persisted store for the settings that should survive a reload but
 * are not part of the session: appearance, motion, density, and which
 * notification categories are shown.
 *
 * Preferences are projected onto `<html>` as data attributes so CSS can react
 * to them (`[data-fx='reduced']`, `[data-density='compact']`, …) instead of
 * every component having to subscribe and imperatively restyle itself.
 */

import { createStore } from './store.js';
import { read, write } from '../utils/storage.js';

const STORAGE_KEY = 'prefs';

/** Defaults, also used to fill in anything missing from storage. */
const DEFAULTS = {
  /** 'comfortable' | 'compact' — row padding and card spacing. */
  density: 'comfortable',

  /**
   * 'full'    — aurora field, grain and spotlight all animate
   * 'reduced' — the aurora field is frozen and the grain stops jittering
   * 'off'     — the ambient backdrop is hidden entirely
   *
   * This is not cosmetic. The aurora's additive blend is the single most
   * expensive thing the page draws; measured on the dashboard scroll, dropping
   * it took long frames from 25% to 1%. `reduced` keeps the artwork but stops
   * the compositing cost.
   */
  effects: 'full',

  /** Notification categories to surface. */
  notify: { chat: true, grade: true, friend: true, news: true },

  /** Show the greeting + countdown hero on the dashboard. */
  compactHero: false,
};

const store = createStore({ ...DEFAULTS, ...read(STORAGE_KEY, {}) });

/** Persist and project onto the document root. */
function commit(state) {
  write(STORAGE_KEY, {
    density: state.density,
    effects: state.effects,
    notify: state.notify,
    compactHero: state.compactHero,
  });
  applyToDocument(state);
}

/** Write the current preferences onto `<html>`. */
export function applyToDocument(state = store.getState()) {
  const root = document.documentElement;
  root.dataset.density = state.density;
  root.dataset.fx = state.effects;
  root.dataset.compactHero = String(state.compactHero);
}

store.subscribe(commit);

/** Read the current preferences. */
export const getPrefs = () => store.getState();

/** Merge a patch into the preferences. */
export function setPrefs(patch) {
  store.setState(patch);
}

/** Flip one notification category. */
export function toggleNotifyCategory(key) {
  const { notify } = store.getState();
  store.setState({ notify: { ...notify, [key]: !notify[key] } });
}

/** Restore every preference to its default. */
export function resetPrefs() {
  store.setState({ ...DEFAULTS });
}

/**
 * Restore the OS-level reduced-motion preference.
 *
 * Deliberately separate from `effects`: the OS setting is a hard accessibility
 * requirement and must win over any in-app choice, so it flips the effects
 * tier down and keeps following the system.
 */
export function syncSystemMotionPreference() {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    if (query.matches) setPrefs({ effects: 'off' });
    document.documentElement.dataset.reducedMotion = String(query.matches);
  };
  query.addEventListener('change', apply);
  apply();
}

/** Apply preferences as early as possible — called from main.js on boot. */
export function initPreferences() {
  applyToDocument();
  syncSystemMotionPreference();
}

export { DEFAULTS as PREF_DEFAULTS };