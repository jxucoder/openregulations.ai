/**
 * Hairline figures (MIT, @lucasmarkes/hairline): isometric line drawings that answer the pointer.
 * Any element with data-figure="<name>" is mounted automatically; colors come from the
 * .fig-ink / .fig-field classes in main.css.
 */

import { sieve, terrain, loupe, query, drawer, plug } from '@lucasmarkes/hairline';

const FIGURES = { sieve, terrain, loupe, query, drawer, plug };
let mounted = [];

export function mountFigures(root) {
  root.querySelectorAll('[data-figure]:not([data-mounted])').forEach((el) => {
    const draw = FIGURES[el.dataset.figure];
    if (!draw) return;
    el.dataset.mounted = '1';
    mounted.push(draw(el, {
      theme: 'light',
      label: el.dataset.label || undefined,
      play: el.dataset.play === '1',
    }));
  });
}

export function destroyFigures() {
  mounted.forEach((f) => f.destroy());
  mounted = [];
}

/** Observe a container and mount figures as views insert them. */
export function watchFigures(root) {
  mountFigures(root);
  new MutationObserver(() => mountFigures(root)).observe(root, { childList: true, subtree: true });
}
