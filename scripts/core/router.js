/**
 * Hash router
 * Pattern-based matching with `:param` segments, a route guard, and
 * per-view enter/exit transitions.
 *
 * Usage:
 *   const router = createRouter({
 *     routes: [{ path: '/news/:id', view: NewsDetail }],
 *     outlet: document.querySelector('#view'),
 *     guard: (route) => (store.getState().auth.user ? true : '/login'),
 *   });
 */

import { el, render } from '../utils/dom.js';
import { enhance } from '../utils/motion.js';

/** Window event dispatched after every successful route resolution. */
export const ROUTE_EVENT = 'utc:route';

/**
 * @param {object} options
 * @param {Array<{path: string, view: Function, title?: string, auth?: boolean}>} options.routes
 * @param {HTMLElement} options.outlet - Container the matched view renders into.
 * @param {Function} options.guard - Optional redirect resolver.
 * @param {Function} options.onNavigate - Optional change listener.
 */
export function createRouter({ routes, outlet, guard, onNavigate } = {}) {
  let currentRoute = null;
  let currentCleanup = null;
  let resolveToken = 0;

  /** Compile "/news/:id" into a regex + param names. */
  function compile(pattern) {
    const names = [];
    const source = pattern
      .replace(/\/:([^/]+)/g, (_, name) => {
        names.push(name);
        return '/([^/]+)';
      })
      .replace(/\*/g, '.*');
    return { regex: new RegExp(`^${source}$`), names };
  }

  const compiled = routes.map((route) => ({ ...route, ...compile(route.path) }));

  /** Current path + query, normalised. */
  function currentPath() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  /** Split a path into its pathname and search string. */
  function parse(path) {
    const [pathname, search = ''] = path.split('?');
    return { pathname, search };
  }

  /** Find the first matching route. */
  function match(pathname) {
    for (const route of compiled) {
      const result = route.regex.exec(pathname);
      if (!result) continue;
      const params = {};
      route.names.forEach((name, index) => {
        params[name] = decodeURIComponent(result[index + 1]);
      });
      return { route, params };
    }
    return null;
  }

  /** Navigate imperatively. */
  function navigate(path, { replace = false } = {}) {
    const target = `#${path.startsWith('/') ? path : `/${path}`}`;
    if (window.location.hash === target) {
      resolve();
      return;
    }
    if (replace) window.history.replaceState(null, '', target);
    else window.location.hash = target;
  }

  /** Render the route matching the current URL. */
  async function resolve() {
    const path = currentPath();
    const { pathname, search } = parse(path);

    /**
     * Views are async now, so two navigations can overlap: the user clicks a
     * link while the previous page is still loading. This token discards the
     * stale render — otherwise the slower page would win and overwrite the one
     * the user actually asked for.
     */
    const token = (resolveToken += 1);

    // Resolve the target first so the guard can inspect its metadata
    const found = match(pathname);
    const target = found?.route ?? routes.find((route) => route.path === '*') ?? null;

    if (!target) {
      outlet.replaceChildren();
      return;
    }

    // Route params (`:id`) and query params (`?course=c1`) are both exposed;
    // route params take precedence on a name clash.
    const params = {
      ...Object.fromEntries(new URLSearchParams(search)),
      ...(found?.params ?? {}),
    };

    if (guard) {
      const redirect = guard({ route: target, pathname, params, search });
      if (redirect && redirect !== pathname) {
        navigate(redirect, { replace: true });
        return;
      }
    }

    // Tear down the previous view
    if (typeof currentCleanup === 'function') {
      try {
        currentCleanup();
      } catch (error) {
        console.error('[router] cleanup failed:', error);
      } finally {
        currentCleanup = null;
      }
    }

    // The outlet is intentionally NOT faded out and back in around the swap.
    // Setting `opacity: 0` and clearing it a frame later forces the browser to
    // repaint the whole outlet twice per navigation for no visual benefit — the
    // `.route-view` class below already animates the new view in.

    const context = { params, search: params, navigate, pathname };

    // A view may either RETURN a node (the router mounts it into the outlet)
    // or render into the outlet itself and return null. This keeps the shell
    // — which must survive navigation — owned by the app rather than the router.
    let viewOwnsOutlet = true;

    try {
      // Awaited so a page that loads data before returning has finished; a
      // Promise is not a Node, so it correctly counts as "renders itself".
      const result = await target.view(context);

      // A newer navigation started while this view was loading: drop both the
      // render and the teardown, which would otherwise cancel the next page's
      // subscriptions.
      if (token !== resolveToken) {
        if (typeof result === 'function') result();
        return;
      }

      if (typeof result === 'function') {
        // A view may return a teardown function (its realtime subscriptions,
        // timers, observers). The router calls it before the next navigation.
        currentCleanup = result;
      }

      if (result instanceof Node) {
        render(outlet, result);
      } else {
        viewOwnsOutlet = false;
      }
    } catch (error) {
      console.error(`[router] failed to render "${pathname}":`, error);
      outlet.replaceChildren(
        el('div.empty-state', {}, [
          el('div.empty-state__icon', {}, '!'),
          el('h3.section-title', {}, 'Đã xảy ra lỗi khi tải trang này'),
          el('p.body-text', {}, error.message),
        ])
      );
    }

    if (viewOwnsOutlet) {
      outlet.classList.remove('route-view');
      void outlet.offsetWidth;
      outlet.classList.add('route-view');
      enhance(outlet);
    }

    if (typeof target.title) {
      document.title = `${target.title} · UTC Student`;
    }

    currentRoute = target;

    // Announce the resolved route on the window so persistent chrome (sidebar
    // active state, topbar title) can re-sync after any navigation — including
    // programmatic ones that never fire `hashchange`.
    window.dispatchEvent(
      new CustomEvent(ROUTE_EVENT, { detail: { route: target, params, pathname } })
    );

    onNavigate?.({ route: target, params, pathname });
  }

  function start() {
    window.addEventListener('hashchange', resolve);
    if (!window.location.hash) {
      navigate('/', { replace: true });
    } else {
      resolve();
    }
  }

  return {
    start,
    resolve,
    navigate,
    get route() {
      return currentRoute;
    },
  };
}

export const router = {
  go(path, options) {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
    if (options?.replace) {
      window.history.replaceState(null, '', `#${path}`);
    }
  },
};