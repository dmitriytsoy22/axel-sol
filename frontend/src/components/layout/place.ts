/*
 * Pages read the chain after they render, so whatever sits above a point of the page grows
 * after the browser has scrolled to it. These keep one element where the reader expects it
 * while the rest fills in.
 */

let release: (() => void) | null = null;

const INPUTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Aligns the element `find` returns, now and each time the page changes height, until the
 * reader scrolls, touches or presses a key. The element may not be on the page yet. One hold
 * at a time, and the first wins: a place kept across a language switch outranks the section
 * named in the address.
 */
export function holdInPlace(
  find: () => HTMLElement | null,
  align: (element: HTMLElement) => void,
): () => void {
  if (release) return () => {};
  const apply = () => {
    const element = find();
    if (element) align(element);
  };
  const observer = new ResizeObserver(apply);
  const stop = () => {
    observer.disconnect();
    for (const type of INPUTS) window.removeEventListener(type, stop);
    if (release === stop) release = null;
  };
  release = stop;
  apply();
  observer.observe(document.body);
  for (const type of INPUTS) window.addEventListener(type, stop, { passive: true });
  return stop;
}

const PLACE_KEY = 'axel:place';

interface Place {
  path: string;
  /** The address's #section, which the redirect to an unprefixed English address drops. */
  hash: string;
  /** The element with an id nearest the bar, and its top in px from the top of the screen. */
  anchor: { id: string; top: number } | null;
}

/** Inside a sticky or fixed box, which stays put whatever the page's scroll. */
function pinned(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const { position } = getComputedStyle(node);
    if (position === 'sticky' || position === 'fixed') return true;
  }
  return false;
}

/**
 * Notes where the reader is before the page loads again in another language. React's
 * generated ids (":r1:") are skipped, since they need not survive the reload, and so are ids
 * in a sticky panel, which sits by the bar wherever the reader is.
 */
export function rememberPlace(path: string): void {
  const bar = document.getElementById('navbar')?.getBoundingClientRect().bottom ?? 0;
  let anchor: Place['anchor'] = null;
  for (const element of document.querySelectorAll<HTMLElement>('#main [id]')) {
    if (element.id.startsWith(':') || element.getClientRects().length === 0) continue;
    if (pinned(element)) continue;
    const { top } = element.getBoundingClientRect();
    if (!anchor || Math.abs(top - bar) < Math.abs(anchor.top - bar)) {
      anchor = { id: element.id, top };
    }
  }
  const place: Place = { path, hash: window.location.hash, anchor };
  sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
}

/** Brings back the address's section and the place `rememberPlace` noted for this page. */
export function restorePlace(path: string): void {
  const saved = sessionStorage.getItem(PLACE_KEY);
  if (!saved) return;
  sessionStorage.removeItem(PLACE_KEY);
  const { path: savedPath, hash, anchor } = JSON.parse(saved) as Place;
  if (savedPath !== path) return;
  if (hash && !window.location.hash) {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`);
  }
  if (!anchor) return;
  holdInPlace(
    () => document.getElementById(anchor.id),
    (element) =>
      window.scrollBy({
        top: element.getBoundingClientRect().top - anchor.top,
        behavior: 'instant',
      }),
  );
}
