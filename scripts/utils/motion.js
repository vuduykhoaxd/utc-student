/**
 * Motion helpers
 * All animation is opt-in and respects `prefers-reduced-motion`.
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the user asked for reduced motion. */
export const prefersReducedMotion = () =>
  window.matchMedia(REDUCED_QUERY).matches;

/* -------------------------------------------------------------------------- */
/* Reveal on scroll                                                            */
/* -------------------------------------------------------------------------- */

let revealObserver = null;

/**
 * Promote an element to its own compositor layer for exactly as long as the
 * reveal transition runs, then release it. Leaving `will-change` set would
 * pin a layer (and GPU memory) for every revealed element on the page.
 * @param {HTMLElement} node
 */
function runReveal(node) {
  node.classList.add('is-revealing', 'is-revealed');
  const release = () => {
    node.classList.remove('is-revealing');
    node.removeEventListener('transitionend', release);
  };
  node.addEventListener('transitionend', release);
  // Safety net: a node that never fires transitionend (reduced motion, a
  // hidden tab) must not keep its layer pinned.
  setTimeout(release, 1600);
}

/**
 * Observe every `[data-reveal]` inside `root` and animate it into view once.
 * Re-entering the viewport does not re-trigger the animation.
 */
export function observeReveals(root = document) {
  if (prefersReducedMotion()) {
    root.querySelectorAll('[data-reveal]').forEach((node) => {
      node.classList.add('is-revealed');
    });
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          runReveal(entry.target);
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    );
  }

  root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((node) => {
    revealObserver.observe(node);
  });
}

/**
 * Reveal an updated subtree immediately.
 *
 * Content that replaces existing content (a filtered grid, a redrawn panel)
 * must not wait for an observer: the nodes are new, so the scroll observer will
 * never see them and they would stay at `opacity: 0` forever. Unlike
 * `revealNow()` this does not stagger, because an in-place update should not
 * re-choreograph the whole list.
 */
export function revealRendered(root) {
  if (!root) return;
  root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((node) => {
    node.classList.add('is-revealed');
  });
}

/** Immediately reveal everything under a freshly rendered subtree. */
export function revealNow(root) {
  requestAnimationFrame(() => {
    root.querySelectorAll('[data-reveal]').forEach((node, index) => {
      node.style.setProperty('--reveal-delay', `${Math.min(index * 45, 360)}ms`);
      runReveal(node);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Pointer effects                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Attach a pointer-following radial gradient to a card.
 * @param {HTMLElement} node
 * @param {object} [options]
 * @param {string} [options.property] - CSS property pair, e.g. '--spot-x'.
 */
export function attachSpotlight(node, { property = '--spot' } = {}) {
  if (prefersReducedMotion()) return;
  if (window.matchMedia('(hover: none)').matches) return;

  const onMove = (event) => {
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    node.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };

  node.addEventListener('pointermove', onMove);
}

/**
 * Magnetic pull toward the cursor. Adds `--mag-x` / `--mag-y`.
 */
export function attachMagnetic(node, strength = 0.28) {
  if (prefersReducedMotion()) return;
  if (window.matchMedia('(hover: none)').matches) return;

  const reset = () => {
    node.style.setProperty('--mag-x', '0px');
    node.style.setProperty('--mag-y', '0px');
  };

  node.addEventListener('pointermove', (event) => {
    const rect = node.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) * strength;
    const dy = (event.clientY - (rect.top + rect.height / 2)) * strength;
    node.style.setProperty('--mag-x', `${dx.toFixed(1)}px`);
    node.style.setProperty('--mag-y', `${dy.toFixed(1)}px`);
  });

  node.addEventListener('pointerleave', reset);
  node.addEventListener('blur', reset);
}

/**
 * Delegated click ripple. Attach once on a container.
 */
export function attachRipple(root) {
  root.addEventListener('pointerdown', (event) => {
    if (prefersReducedMotion()) return;
    const host = event.target.closest('.ripple-host');
    if (!host || host.hasAttribute('disabled')) return;

    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.setProperty('--ripple-size', `${size}px`);
    ripple.style.setProperty('--ripple-x', `${event.clientX - rect.left}px`);
    ripple.style.setProperty('--ripple-y', `${event.clientY - rect.top}px`);

    host.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

/* -------------------------------------------------------------------------- */
/* Numeric / decorative                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Count a number up when it scrolls into view.
 * @param {HTMLElement} node - Element carrying the target in `data-count-to`.
 *   Optional `data-count-format="compact|plain"` controls the rendered form.
 */
export function attachCountUp(node) {
  const target = Number(node.dataset.countTo ?? 0);
  const duration = Number(node.dataset.countDuration ?? 1100);
  const decimals = Number(node.dataset.countDecimals ?? 0);
  const useCompact = node.dataset.countFormat === 'compact';

  const render = (value) => {
    if (useCompact) {
      if (value < 1000) return String(Math.round(value));
      if (value < 1_000_000) {
        return `${(value / 1000).toFixed(1).replace('.0', '').replace('.', ',')}K`;
      }
      return `${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
    }
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const run = () => {
    if (prefersReducedMotion()) {
      node.textContent = render(target);
      return;
    }
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = render(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else {
        node.textContent = render(target);
        node.classList.add('count-flash');
        setTimeout(() => node.classList.remove('count-flash'), 400);
      }
    };

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        run();
        observer.disconnect();
      }
    },
    { threshold: 0.4 }
  );
  observer.observe(node);
}

/** Attach every supported motion enhancement inside a subtree. */
export function enhance(root = document) {
  observeReveals(root);
  root.querySelectorAll('[data-spotlight]').forEach((n) => attachSpotlight(n));
  root.querySelectorAll('[data-magnetic]').forEach((n) =>
    attachMagnetic(n, Number(n.dataset.magnetic) || 0.28)
  );
  root.querySelectorAll('[data-count-to]').forEach(attachCountUp);
}