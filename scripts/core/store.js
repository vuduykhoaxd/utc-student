/**
 * Application store
 * A minimal observable store: `createStore` holds state, notifies subscribers,
 * and exposes `setState` / `subscribe` / `select`.
 */

/**
 * @template T
 * @param {T} initialState
 * @returns {{
 *   getState: () => T,
 *   setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => T,
 *   subscribe: (fn: (state: T, prev: T) => void) => () => void,
 *   select: <R>(selector: (state: T) => R) => () => R,
 * }}
 */
export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();
  let notifying = false;
  let pendingPrev = state;

  function getState() {
    return state;
  }

  function setState(partial) {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    if (!patch) return state;

    const prev = state;
    const next = { ...state, ...patch };

    // Skip notification when nothing actually changed
    const changed = Object.keys(patch).some((key) => prev[key] !== next[key]);
    if (!changed) return state;

    state = next;
    if (notifying) {
      pendingPrev = prev;
    } else {
      notify(prev);
    }
    return state;
  }

  function notify(prev) {
    notifying = true;
    subscribers.forEach((fn) => {
      try {
        fn(state, prev);
      } catch (error) {
        console.error('[store] subscriber failed:', error);
      }
    });
    notifying = false;
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function select(selector) {
    let last = selector(state);
    return (nextState = state) => {
      const value = selector(nextState);
      if (value !== last) {
        last = value;
        fn(value);
      }
      return value;
    };
  }

  return { getState, setState, subscribe, select };
}

/**
 * Bind a store to a DOM side effect.
 * Runs immediately, then on every change; returns an unsubscribe function.
 */
export function watch(store, selector, handler) {
  handler(selector(store.getState()));
  return store.subscribe((state) => handler(selector(state)));
}