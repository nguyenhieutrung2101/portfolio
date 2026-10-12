/**
 * Draggable bottom sheet behaviour, shared by Mèo's guide and the book sheet.
 *
 * The sheet only ever moves with `transform: translateY`. Dragging tracks the
 * finger 1:1 from wherever the sheet currently is (it can be grabbed
 * mid-animation), resists past its bounds, and on release projects the
 * momentum to pick a snap point and hands the finger's velocity to the spring.
 */
import { Spring, VelocityTracker, project, rubberband } from './spring';

export interface SheetOptions {
  panel: HTMLElement;
  handle: HTMLElement;
  /** Resting positions in px; 0 = fully open. */
  snaps: () => number[];
  initial: number;
  paint?: (y: number) => void;
  onSettle?: (y: number) => void;
  enabled?: () => boolean;
}

export function createSheet(options: SheetOptions) {
  const { panel, handle } = options;
  const enabled = options.enabled ?? (() => true);
  const y = new Spring(
    options.initial,
    (value) => {
      panel.style.transform = value === 0 && !drag ? '' : `translate3d(0, ${value}px, 0)`;
      options.paint?.(value);
    },
    { response: 0.36, precision: 0.3 },
  );
  y.onRest = () => {
    // Back to critically damped for programmatic moves.
    y.damping = 1;
    options.onSettle?.(y.value);
  };

  const tracker = new VelocityTracker();
  let drag: { id: number; startX: number; startY: number; from: number; active: boolean } | null = null;
  let suppressClick = false;

  const bounds = () => {
    const snaps = options.snaps();
    return [Math.min(...snaps), Math.max(...snaps)] as const;
  };

  handle.addEventListener('pointerdown', (event) => {
    if (!enabled() || event.button !== 0 || drag) return;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, from: y.value, active: false };
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        drag = null;
        return;
      }
      if (Math.abs(dy) < 6) return;
      // Commit to the drag. Grab from the presentation value so a sheet that
      // is still animating is caught where it is, without a jump.
      drag.active = true;
      drag.from = y.value;
      drag.startY = event.clientY;
      handle.setPointerCapture(event.pointerId);
      panel.dataset.dragging = '';
      tracker.reset();
    }
    const [min, max] = bounds();
    let next = drag.from + (event.clientY - drag.startY);
    const size = panel.offsetHeight || 400;
    if (next < min) next = min + rubberband(next - min, size);
    else if (next > max) next = max + rubberband(next - max, size);
    tracker.add(next, event.timeStamp || performance.now());
    y.track(next, tracker.velocity);
  });

  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const wasActive = drag.active;
    drag = null;
    if (!wasActive) return;
    delete panel.dataset.dragging;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const velocity = event.type === 'pointercancel' ? 0 : tracker.velocity;
    const landing = y.value + project(velocity, 0.99);
    const snaps = options.snaps();
    const target = snaps.reduce((best, s) => (Math.abs(s - landing) < Math.abs(best - landing) ? s : best), snaps[0]);
    // A little bounce only when the gesture itself carried momentum.
    y.to(target, { velocity, damping: Math.abs(velocity) > 400 ? 0.8 : 1, response: 0.32 });
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    },
    true,
  );

  return {
    spring: y,
    get dragging() {
      return !!drag?.active;
    },
    snapTo(target: number, velocity?: number) {
      y.to(target, { velocity, damping: 1, response: 0.36 });
    },
  };
}
