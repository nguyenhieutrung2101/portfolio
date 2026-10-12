/**
 * Press feedback for every button and [data-press] link.
 *
 * - Shows on pointer-down, not on release.
 * - Inside horizontal scrollers ([data-scroll-x]) it waits ~80ms first, like
 *   iOS's delaysContentTouches, so starting a swipe doesn't flash every card.
 * - Moving more than 10px cancels it (the gesture became a scroll).
 * - At rest the element carries no transform, so it isn't kept on its own
 *   compositor layer.
 */
import { Spring, clamp } from './spring';

const SELECTOR = 'button:not(:disabled), a[data-press], [role="button"]';
const springs = new WeakMap<HTMLElement, Spring>();

function pressSpring(el: HTMLElement) {
  let s = springs.get(el);
  if (!s) {
    const depth = Number(el.dataset.pressDepth ?? 1);
    s = new Spring(
      0,
      (value) => {
        const p = clamp(value);
        if (p <= 0.001) {
          el.style.transform = '';
          delete el.dataset.pressing;
          return;
        }
        el.dataset.pressing = '';
        el.style.transform = `translate3d(0, ${1.5 * p * depth}px, 0) scale(${1 - 0.03 * p * depth})`;
      },
      { response: 0.24, precision: 0.002 },
    );
    springs.set(el, s);
  }
  return s;
}

let current: { el: HTMLElement; x: number; y: number; timer: number } | null = null;

function down(el: HTMLElement) {
  pressSpring(el).to(1, { response: 0.08 });
}

function up(cancelled = false) {
  if (!current) return;
  clearTimeout(current.timer);
  pressSpring(current.el).to(0, { response: cancelled ? 0.2 : 0.28 });
  current = null;
}

export function installPress() {
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      const el = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!el || el.closest('[data-no-press]')) return;
      up();
      const delayed = event.pointerType !== 'mouse' && !!el.closest('[data-scroll-x]');
      current = {
        el,
        x: event.clientX,
        y: event.clientY,
        timer: delayed ? window.setTimeout(() => down(el), 80) : 0,
      };
      if (!delayed) down(el);
    },
    { passive: true },
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) up(true);
    },
    { passive: true },
  );
  window.addEventListener('pointerup', () => up(), { passive: true });
  window.addEventListener('pointercancel', () => up(true), { passive: true });
  window.addEventListener('blur', () => up(true));
  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const el = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
    if (!el) return;
    up();
    current = { el, x: 0, y: 0, timer: 0 };
    down(el);
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ') up();
  });
}
