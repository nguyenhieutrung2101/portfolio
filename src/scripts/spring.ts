/**
 * Tiny spring engine, refactored from the mockup.
 *
 * - Parameterised the way Apple does it: `response` (seconds, the undamped
 *   period) and `damping` (ratio; 1 = critically damped, < 1 overshoots).
 * - Exact closed-form step, so a long frame never destabilises it.
 * - Interruptible: `to()` only changes the target. Position and velocity carry
 *   over, so reversing mid-flight stays continuous.
 * - Only springs that are actually moving are ticked. A spring at rest costs
 *   nothing and can be garbage collected with its element.
 * - `onRest` callbacks run after the frame's paint pass, never in the middle of
 *   it, so layout work done there cannot thrash the loop.
 */

export interface SpringOptions {
  /** Seconds. Lower is snappier. */
  response?: number;
  /** 1 = no overshoot. ~0.8 for momentum-driven motion. */
  damping?: number;
  /** Settle threshold in the spring's own unit (px, deg, 0–1…). */
  precision?: number;
  /** Keep animating under prefers-reduced-motion (rarely what you want). */
  essential?: boolean;
}

type Paint = (value: number, spring: Spring) => void;

const reduceQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export let reducedMotion = reduceQuery?.matches ?? false;

const active = new Set<Spring>();
const restQueue: Spring[] = [];
let frame = 0;
let last = 0;

function tick(now: number) {
  frame = 0;
  const dt = Math.min(0.064, Math.max(0.001, (now - last) / 1000));
  last = now;
  for (const spring of Array.from(active)) {
    if (spring.step(dt)) {
      active.delete(spring);
      restQueue.push(spring);
    }
  }
  // Callbacks after every spring has painted this frame.
  while (restQueue.length) restQueue.shift()!.onRest?.();
  if (active.size) frame = requestAnimationFrame(tick);
}

function wake() {
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  response: number;
  damping: number;
  precision: number;
  essential: boolean;
  onRest?: () => void;
  private paint: Paint;

  constructor(initial: number, paint: Paint, options: SpringOptions = {}) {
    this.value = initial;
    this.target = initial;
    this.paint = paint;
    this.response = options.response ?? 0.4;
    this.damping = Math.min(1, options.damping ?? 1);
    this.precision = options.precision ?? 0.01;
    this.essential = options.essential ?? false;
  }

  get moving() {
    return active.has(this);
  }

  /** Animate to `target`, optionally handing off a release velocity (units/s). */
  to(target: number, opts: { velocity?: number; response?: number; damping?: number } = {}) {
    this.target = target;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    if (opts.response !== undefined) this.response = opts.response;
    if (opts.damping !== undefined) this.damping = Math.min(1, opts.damping);
    if (reducedMotion && !this.essential) return this.set(target);
    if (this.value === target && this.velocity === 0) {
      this.onRest?.();
      return this;
    }
    active.add(this);
    wake();
    return this;
  }

  /** Jump to a value and stop. */
  set(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    active.delete(this);
    this.paint(value, this);
    this.onRest?.();
    return this;
  }

  /** Move the current value without touching velocity or target (FLIP rebasing). */
  shift(delta: number) {
    if (!delta) return this;
    this.value += delta;
    this.paint(this.value, this);
    if (reducedMotion && !this.essential) return this.set(this.target);
    active.add(this);
    wake();
    return this;
  }

  /** Follow a gesture directly: set value, track velocity, stop animating. */
  track(value: number, velocity: number) {
    active.delete(this);
    this.value = value;
    this.target = value;
    this.velocity = velocity;
    this.paint(value, this);
    return this;
  }

  repaint() {
    this.paint(this.value, this);
  }

  /** Advances one frame. Returns true once settled. */
  step(dt: number): boolean {
    const x0 = this.value - this.target;
    const v0 = this.velocity;
    const w0 = (2 * Math.PI) / this.response;
    const z = this.damping;
    let x: number;
    let v: number;
    if (z >= 1) {
      const decay = Math.exp(-w0 * dt);
      const c = v0 + w0 * x0;
      x = (x0 + c * dt) * decay;
      v = (v0 - w0 * c * dt) * decay;
    } else {
      const wd = w0 * Math.sqrt(1 - z * z);
      const decay = Math.exp(-z * w0 * dt);
      const cos = Math.cos(wd * dt);
      const sin = Math.sin(wd * dt);
      x = decay * (x0 * cos + ((v0 + z * w0 * x0) / wd) * sin);
      v = decay * (v0 * cos - ((z * w0 * v0 + w0 * w0 * x0) / wd) * sin);
    }
    const settled = Math.abs(x) < this.precision && Math.abs(v) < this.precision * 10;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
    } else {
      this.value = this.target + x;
      this.velocity = v;
    }
    this.paint(this.value, this);
    return settled;
  }
}

export function spring(initial: number, paint: Paint, options?: SpringOptions) {
  return new Spring(initial, paint, options);
}

reduceQuery?.addEventListener?.('change', (event) => {
  reducedMotion = event.matches;
  if (reducedMotion) for (const s of Array.from(active)) if (!s.essential) s.set(s.target);
});

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Apple's momentum projection (Designing Fluid Interfaces sample code). */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  const sign = Math.sign(overshoot);
  const abs = Math.abs(overshoot);
  return sign * ((abs * dimension * constant) / (dimension + constant * abs));
}

/** Short position history → release velocity (px/s). */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];
  reset() {
    this.samples.length = 0;
  }
  add(value: number, t = performance.now()) {
    this.samples.push({ t, v: value });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }
  get velocity() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = b.t - a.t;
    return dt > 0 ? ((b.v - a.v) / dt) * 1000 : 0;
  }
}

/**
 * Crossfade a region while its content changes. Rapid successive updates keep
 * only the latest one. The DOM mutation runs after the animation frame (in
 * onRest/microtask), so the layout it causes happens once, outside the tick.
 */
export function crossfade(element: HTMLElement, options: SpringOptions = {}) {
  let pending: (() => void) | null = null;
  let scheduled = false;
  const commit = () => {
    scheduled = false;
    if (!pending) return;
    const update = pending;
    pending = null;
    update();
    fade.to(1);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(commit);
  };
  const fade: Spring = new Spring(
    1,
    (value) => {
      const alpha = clamp(value);
      element.style.opacity = alpha >= 1 ? '' : String(alpha);
      element.style.transform = alpha >= 1 ? '' : `translate3d(0, ${3 * (1 - alpha)}px, 0)`;
      // Swap while still faintly visible: less latency, and the text change
      // lands after this frame's tick instead of inside it.
      if (pending && alpha <= 0.2) schedule();
    },
    { response: 0.2, precision: 0.004, ...options },
  );
  return {
    replace(update: () => void) {
      pending = update;
      if (reducedMotion || fade.value <= 0.2) schedule();
      else fade.to(0);
    },
  };
}
