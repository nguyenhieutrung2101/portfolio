/**
 * Small event bus between the page and Mèo. Pages never import the guide; they
 * just announce what happened and the guide/cats react.
 */

export interface SayDetail {
  text: string;
  /** Element the cat should glance at. */
  look?: Element | null;
  mood?: 'perk' | 'happy';
}

export function say(text: string, extra: Omit<SayDetail, 'text'> = {}) {
  window.dispatchEvent(new CustomEvent<SayDetail>('cat:say', { detail: { text, ...extra } }));
}

export function onSay(handler: (detail: SayDetail) => void, signal?: AbortSignal) {
  window.addEventListener('cat:say', (event) => handler((event as CustomEvent<SayDetail>).detail), { signal });
}

/** Last time the visitor did anything; cats fall asleep after a while. */
export let lastActivity = performance.now();
const markActive = () => {
  lastActivity = performance.now();
  window.dispatchEvent(new Event('cat:activity'));
};
let activityThrottle = 0;
const throttledActive = () => {
  const now = performance.now();
  if (now - activityThrottle < 250) return;
  activityThrottle = now;
  markActive();
};
if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchmove']) {
    window.addEventListener(type, throttledActive, { passive: true, capture: true });
  }
  window.addEventListener('pointermove', throttledActive, { passive: true });
}
