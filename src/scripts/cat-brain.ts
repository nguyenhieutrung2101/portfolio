/**
 * Mèo's behaviour. Every cat on the page ([data-cat]) gets a brain:
 *
 * - Blinks on its own clock (2.5–6s, sometimes twice).
 * - When awake and idle it picks a small gesture every few seconds: ear
 *   twitch, tail flick, look around, groom a paw, yawn, stretch.
 * - Falls asleep after ~25s without any activity; wakes up when you do anything.
 * - Desktop: eyes and head follow the pointer (separate X/Y springs).
 *   Touch: glances at whatever you just tapped.
 * - Tap the cat: purr-wiggle, little hop, a heart, a short haptic tick.
 * - Pauses entirely when offscreen or when the tab is hidden.
 *
 * One-shot gestures use WAAPI on dedicated SVG groups, so they never fight the
 * CSS loops (breathing, tail sway) or the look springs.
 */
import { Spring, clamp, reducedMotion } from './spring';
import { lastActivity, onSay, say, type SayDetail } from './cat-bus';

const SLEEP_AFTER_MS = 25_000;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const PET_LINES = [
  'Rừ… rừ…',
  'Gãi sau tai nữa đi.',
  'Tớ đang trực đấy nhé, nhưng gãi thì vẫn nhận.',
  'Meo.',
  'Cậu có mùi giống người tốt.',
];
const PET_LIMIT_LINE = 'Thôi đủ rồi, tớ còn phải trông nhà cho Trung.';
const WAKE_LINE = 'Ơ… tớ có ngủ đâu. Tớ chỉ nhắm mắt trông nhà thôi.';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

let petCount = 0;
let petResetTimer = 0;

class CatBrain {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private q = <T extends Element = SVGGElement>(sel: string) => this.el.querySelector<T>(sel)!;
  private qa = <T extends Element = SVGGElement>(sel: string) => Array.from(this.el.querySelectorAll<T>(sel));
  private abort = new AbortController();
  private timers = new Set<number>();
  private running = new WeakMap<Element, Animation>();
  private visible = true;
  private asleep = false;
  private asleepSince = 0;
  private busy = false;
  private lookX: Spring;
  private lookY: Spring;
  private hop: Spring;
  private glanceTimer = 0;
  private observer: IntersectionObserver;
  private isVoice: boolean;

  constructor(el: HTMLElement) {
    this.el = el;
    el.dataset.catAlive = '';
    this.svg = this.q<SVGSVGElement>('svg');
    this.isVoice = !!el.closest('[data-guide]');

    // Each cat sways a little differently.
    el.style.setProperty('--sway-period', `${rand(3.6, 5).toFixed(2)}s`);
    el.style.setProperty('--sway', `${rand(5, 9).toFixed(1)}deg`);

    const headLook = this.q('.c-head-look');
    const eyes = this.q('.c-eyes');
    const paintLook = () => {
      const x = this.lookX?.value ?? 0;
      const y = this.lookY?.value ?? 0;
      const still = Math.abs(x) < 0.002 && Math.abs(y) < 0.002;
      headLook.style.transform = still ? '' : `translate(${(x * 3).toFixed(2)}px, ${(y * 2).toFixed(2)}px) rotate(${(x * 5).toFixed(2)}deg)`;
      eyes.style.transform = still ? '' : `translate(${(x * 2.6).toFixed(2)}px, ${(y * 2.2).toFixed(2)}px)`;
    };
    this.lookX = new Spring(0, paintLook, { response: 0.5, precision: 0.002 });
    this.lookY = new Spring(0, paintLook, { response: 0.5, precision: 0.002 });
    this.hop = new Spring(
      0,
      (v) => {
        this.svg.style.transform = Math.abs(v) < 0.05 ? '' : `translate3d(0, ${v.toFixed(2)}px, 0)`;
      },
      { response: 0.42, damping: 0.55, precision: 0.05 },
    );

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.syncPaused();
    });
    this.observer.observe(el);

    const signal = this.abort.signal;
    document.addEventListener('visibilitychange', () => this.syncPaused(), { signal });
    el.addEventListener('click', () => this.pet(), { signal });
    window.addEventListener('pointermove', (e) => this.follow(e), { passive: true, signal });
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'mouse' && !el.contains(e.target as Node)) this.glanceAt(e.clientX, e.clientY);
      },
      { passive: true, signal },
    );
    window.addEventListener('cat:activity', () => this.asleep && this.wake(), { signal });
    onSay((detail: SayDetail) => this.react(detail), signal);

    this.after(rand(1200, 3000), () => this.blinkLoop());
    this.after(rand(3000, 6000), () => this.idleLoop());
    this.after(2000, () => this.sleepCheck());
  }

  dispose() {
    this.abort.abort();
    this.observer.disconnect();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ── Scheduling ────────────────────────────────────────────────────────
  private after(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.el.isConnected) return this.dispose();
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  private get active() {
    return this.visible && document.visibilityState === 'visible';
  }

  private syncPaused() {
    if (this.active) delete this.el.dataset.paused;
    else this.el.dataset.paused = '';
  }

  private play(target: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    if (!target) return null;
    this.running.get(target)?.cancel();
    const anim = target.animate(keyframes, { easing: 'cubic-bezier(0.3, 0, 0.2, 1)', ...options });
    this.running.set(target, anim);
    return anim;
  }

  // ── Blinking ──────────────────────────────────────────────────────────
  private blinkLoop() {
    if (this.active && !this.asleep && !this.busy) {
      this.blink();
      if (Math.random() < 0.22) this.after(240, () => this.blink());
    }
    this.after(rand(2500, 6000), () => this.blinkLoop());
  }

  private blink() {
    for (const eye of this.qa('.c-eye')) {
      eye.style.transformBox = 'fill-box';
      eye.style.transformOrigin = '50% 50%';
      this.play(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)', offset: 0.45 }, { transform: 'scaleY(1)' }], {
        duration: 170,
        easing: 'ease-in-out',
      });
    }
  }

  // ── Idle gestures ─────────────────────────────────────────────────────
  private idleLoop() {
    if (this.active && !this.asleep && !this.busy && !reducedMotion) {
      const gestures: [number, () => number][] = [
        [3, () => this.earTwitch()],
        [3, () => this.tailFlick()],
        [3, () => this.lookAround()],
        [2, () => this.groom()],
        [1.5, () => this.yawn()],
        [1.5, () => this.stretch()],
      ];
      const total = gestures.reduce((sum, [w]) => sum + w, 0);
      let roll = Math.random() * total;
      const gesture = gestures.find(([w]) => (roll -= w) < 0) ?? gestures[0];
      this.busy = true;
      const duration = gesture[1]();
      this.after(duration, () => (this.busy = false));
    }
    this.after(rand(3200, 7000), () => this.idleLoop());
  }

  private earTwitch() {
    const left = Math.random() < 0.5;
    const ear = this.q(left ? '.c-ear-l' : '.c-ear-r');
    const s = left ? -1 : 1;
    this.play(
      ear,
      [
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${16 * s}deg)`, offset: 0.2 },
        { transform: 'rotate(0deg)', offset: 0.45 },
        { transform: `rotate(${9 * s}deg)`, offset: 0.65 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 460 },
    );
    return 500;
  }

  private tailFlick() {
    this.play(
      this.q('.c-tail'),
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(16deg)', offset: 0.3 },
        { transform: 'rotate(-6deg)', offset: 0.65 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 620 },
    );
    return 650;
  }

  private lookAround() {
    const x = pick([-1, -0.7, 0.7, 1]);
    this.lookX.to(x);
    this.lookY.to(rand(-0.3, 0.2));
    const hold = rand(900, 1600);
    this.after(hold, () => {
      if (Math.random() < 0.5) this.lookX.to(-x * 0.8);
      this.after(rand(700, 1200), () => {
        this.lookX.to(0);
        this.lookY.to(0);
      });
    });
    return hold + 1500;
  }

  private groom() {
    const duration = 2000;
    this.play(
      this.q('.c-paw-l'),
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(10px, -36px) rotate(-24deg)', offset: 0.22 },
        { transform: 'translate(11px, -38px) rotate(-18deg)', offset: 0.4 },
        { transform: 'translate(10px, -36px) rotate(-24deg)', offset: 0.55 },
        { transform: 'translate(11px, -38px) rotate(-18deg)', offset: 0.7 },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration },
    );
    this.play(
      this.q('.c-head'),
      [
        { transform: 'rotate(0deg)' },
        { transform: 'translate(-1px, 2px) rotate(-8deg)', offset: 0.22 },
        { transform: 'translate(-1px, 2px) rotate(-8deg)', offset: 0.75 },
        { transform: 'rotate(0deg)' },
      ],
      { duration },
    );
    for (const eye of this.qa('.c-eye-wrap')) {
      this.play(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.25)', offset: 0.25 }, { transform: 'scaleY(0.25)', offset: 0.75 }, { transform: 'scaleY(1)' }], { duration });
    }
    return duration + 100;
  }

  private yawn() {
    const duration = 1700;
    this.play(
      this.q('.c-yawn'),
      [
        { opacity: 0, transform: 'scale(0.4, 0.1)' },
        { opacity: 1, transform: 'scale(1, 1)', offset: 0.35 },
        { opacity: 1, transform: 'scale(1, 1)', offset: 0.65 },
        { opacity: 0, transform: 'scale(0.4, 0.1)' },
      ],
      { duration },
    );
    this.play(this.q('.c-mouth'), [{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration });
    this.play(
      this.q('.c-head'),
      [{ transform: 'none' }, { transform: 'translateY(-2px) rotate(3deg)', offset: 0.4 }, { transform: 'translateY(-2px) rotate(3deg)', offset: 0.6 }, { transform: 'none' }],
      { duration },
    );
    for (const eye of this.qa('.c-eye-wrap')) {
      this.play(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.15)', offset: 0.3 }, { transform: 'scaleY(0.15)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration });
    }
    return duration + 100;
  }

  private stretch() {
    const duration = 1500;
    this.play(
      this.q('.c-root'),
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.07, 0.92)', offset: 0.35 },
        { transform: 'scale(1.07, 0.92)', offset: 0.6 },
        { transform: 'scale(0.98, 1.03)', offset: 0.8 },
        { transform: 'scale(1, 1)' },
      ],
      { duration },
    );
    for (const eye of this.qa('.c-eye-wrap')) {
      this.play(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.2)', offset: 0.3 }, { transform: 'scaleY(0.2)', offset: 0.65 }, { transform: 'scaleY(1)' }], { duration });
    }
    return duration + 100;
  }

  // ── Attention ─────────────────────────────────────────────────────────
  private lookToward(px: number, py: number, reach = 280) {
    const r = this.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.4;
    this.lookX.to(clamp((px - cx) / reach, -1, 1));
    this.lookY.to(clamp((py - cy) / reach, -0.6, 0.8));
  }

  private pointer = { x: 0, y: 0, frame: 0 };
  private follow(event: PointerEvent) {
    if (!finePointer.matches || event.pointerType !== 'mouse' || !this.active || this.asleep || reducedMotion) return;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    // At most one measurement per frame, however fast the mouse moves.
    if (!this.pointer.frame) {
      this.pointer.frame = requestAnimationFrame(() => {
        this.pointer.frame = 0;
        this.lookToward(this.pointer.x, this.pointer.y, 360);
      });
    }
  }

  private glanceAt(x: number, y: number) {
    if (!this.active || this.asleep || reducedMotion) return;
    this.lookToward(x, y);
    clearTimeout(this.glanceTimer);
    this.glanceTimer = this.after(1400, () => {
      this.lookX.to(0);
      this.lookY.to(0);
    });
  }

  private react(detail: SayDetail) {
    if (this.asleep || !this.active) return;
    if (detail.look && !reducedMotion) {
      const r = detail.look.getBoundingClientRect();
      this.glanceAt(r.left + r.width / 2, r.top + r.height / 2);
    }
    if (detail.mood === 'perk') this.perk();
  }

  /** Ears up, small head tilt: "oh, something new". */
  perk() {
    if (reducedMotion || !this.active || this.asleep) return;
    const ears: [string, number][] = [
      ['.c-ear-l', -1],
      ['.c-ear-r', 1],
    ];
    for (const [sel, s] of ears) {
      this.play(this.q(sel), [{ transform: 'none' }, { transform: `translateY(-2px) rotate(${-6 * s}deg)`, offset: 0.35 }, { transform: 'none' }], { duration: 520 });
    }
    this.play(this.q('.c-head'), [{ transform: 'none' }, { transform: 'rotate(-5deg)', offset: 0.4 }, { transform: 'none' }], { duration: 640 });
  }

  // ── Petting ───────────────────────────────────────────────────────────
  pet() {
    if (this.asleep) this.wake(true);
    navigator.vibrate?.(10);
    const heart = this.q<SVGPathElement>('.c-heart');
    if (reducedMotion) {
      this.play(heart, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 900 });
    } else {
      this.hop.to(0, { velocity: -170 });
      this.play(
        heart,
        [
          { opacity: 0, transform: 'translateY(6px) scale(0.5)' },
          { opacity: 1, transform: 'translateY(0) scale(1.1)', offset: 0.25 },
          { opacity: 1, transform: 'translateY(-6px) scale(1)', offset: 0.6 },
          { opacity: 0, transform: 'translateY(-14px) scale(0.9)' },
        ],
        { duration: 1000 },
      );
      this.play(
        this.q('.c-head'),
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-4deg)', offset: 0.2 },
          { transform: 'rotate(3deg)', offset: 0.4 },
          { transform: 'rotate(-2deg)', offset: 0.6 },
          { transform: 'rotate(1deg)', offset: 0.8 },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 700 },
      );
      for (const eye of this.qa('.c-eye-wrap')) {
        this.play(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.2)', offset: 0.2 }, { transform: 'scaleY(0.2)', offset: 0.75 }, { transform: 'scaleY(1)' }], { duration: 900 });
      }
    }
    petCount += 1;
    clearTimeout(petResetTimer);
    petResetTimer = window.setTimeout(() => (petCount = 0), 6000);
    say(petCount >= 5 ? PET_LIMIT_LINE : pick(PET_LINES), { mood: 'happy' });
    if (petCount >= 5) petCount = 0;
  }

  // ── Sleep ─────────────────────────────────────────────────────────────
  private sleepCheck() {
    if (!this.asleep && this.active && performance.now() - lastActivity > SLEEP_AFTER_MS) this.sleep();
    this.after(2000, () => this.sleepCheck());
  }

  private sleep() {
    this.asleep = true;
    this.asleepSince = performance.now();
    this.lookX.to(0);
    this.lookY.to(0);
    this.el.dataset.state = 'sleep';
    this.el.setAttribute('aria-label', 'Mèo đang ngủ. Chạm để đánh thức.');
  }

  private wake(byPetting = false) {
    if (!this.asleep) return;
    const slept = performance.now() - this.asleepSince;
    this.asleep = false;
    delete this.el.dataset.state;
    this.el.setAttribute('aria-label', 'Mèo. Chạm để vuốt ve.');
    if (!reducedMotion) {
      this.hop.to(0, { velocity: -120 });
      this.perk();
    }
    if (this.isVoice && !byPetting && slept > 8000) say(WAKE_LINE);
  }
}

const brains = new Set<CatBrain>();

export function wakeCats() {
  for (const brain of Array.from(brains)) {
    if (!brain.el.isConnected) {
      brain.dispose();
      brains.delete(brain);
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-cat]:not([data-cat-alive])')) {
    brains.add(new CatBrain(el));
  }
}

/** Every live cat reacts to a navigation. */
export function perkAll() {
  for (const brain of brains) if (brain.el.isConnected) brain.perk();
}
