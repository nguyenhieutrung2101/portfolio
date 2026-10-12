/**
 * Record rack: a native horizontal scroller (keeps the platform's own
 * tracking, momentum and snapping) with the "pull the record out" effect tied
 * directly to scroll position. No animation is replayed after the gesture —
 * the record comes out *while* you swipe, and the one nearest the centre
 * becomes the selection.
 */
import { Spring, clamp, reducedMotion } from './spring';

interface RackOptions {
  root: HTMLElement;
  onSelect: (index: number, card: HTMLElement, viaScroll: boolean) => void;
}

export function initRack({ root, onSelect }: RackOptions) {
  const rack = root.querySelector<HTMLElement>('[data-rack]')!;
  const cards = Array.from(rack.querySelectorAll<HTMLElement>('[data-record]'));
  const count = root.querySelector<HTMLElement>('[data-rack-count]');
  const prev = root.querySelector<HTMLButtonElement>('[data-rack-step="-1"]');
  const next = root.querySelector<HTMLButtonElement>('[data-rack-step="1"]');
  if (!cards.length) return;

  const parts = cards.map((card) => ({
    sleeve: card.querySelector<HTMLElement>('[data-record-sleeve]')!,
    disc: card.querySelector<HTMLElement>('[data-record-disc]')!,
    spinEl: card.querySelector<HTMLElement>('[data-record-spin]')!,
    pull: -1,
    spin: null as Animation | null,
    rate: null as Spring | null,
  }));

  // Geometry is cached; scroll handling only reads scrollLeft.
  let centers: number[] = [];
  let spacing = 1;
  let half = 0;
  const measure = () => {
    centers = cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
    spacing = centers.length > 1 ? centers[1] - centers[0] : cards[0].offsetWidth;
    half = rack.clientWidth / 2;
  };

  let selected = -1;
  let frame = 0;
  let selectTimer = 0;
  // While a tap/arrow scrolls the rack, the records it passes are not
  // "selected" on the way.
  let programmatic: number | null = null;
  let programmaticTimer = 0;
  const endProgrammatic = () => {
    programmatic = null;
    clearTimeout(programmaticTimer);
  };

  function setSpin(i: number, on: boolean) {
    const p = parts[i];
    if (reducedMotion) {
      p.spin?.cancel();
      p.spin = null;
      return;
    }
    if (!p.spin) {
      p.spin = p.spinEl.animate([{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }], {
        duration: 2400,
        iterations: Infinity,
      });
      p.spin.playbackRate = 0;
    }
    if (!p.rate) {
      // Spins up and winds down instead of starting/stopping dead.
      p.rate = new Spring(0, (v) => {
        const anim = p.spin;
        if (!anim) return;
        if (v < 0.01) {
          anim.pause();
          return;
        }
        if (anim.playState !== 'running') anim.play();
        anim.playbackRate = v;
      }, { response: 0.9, precision: 0.005 });
    }
    p.rate.to(on ? 1 : 0, { response: on ? 0.9 : 1.4 });
  }

  function paint() {
    frame = 0;
    const pos = rack.scrollLeft + half;
    let nearest = 0;
    let best = Infinity;
    centers.forEach((center, i) => {
      const d = (center - pos) / spacing;
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        nearest = i;
      }
      const pull = Math.round(clamp(1 - Math.abs(d)) * 1000) / 1000;
      const p = parts[i];
      if (pull === p.pull) return;
      p.pull = pull;
      if (pull === 0) {
        p.sleeve.style.transform = '';
        p.disc.style.transform = '';
      } else {
        p.sleeve.style.transform = `translate3d(0, ${(-10 * pull).toFixed(2)}px, 0) rotate(${(-2 * pull).toFixed(2)}deg)`;
        p.disc.style.transform = `translate3d(${(30 * pull).toFixed(2)}%, 0, 0)`;
      }
    });
    if (programmatic !== null && Math.abs(rack.scrollLeft - programmatic) < 2) endProgrammatic();
    if (programmatic === null && nearest !== selected) choose(nearest, true);
  }

  function choose(index: number, viaScroll: boolean) {
    const previous = selected;
    selected = index;
    cards.forEach((card, i) => card.setAttribute('aria-pressed', String(i === index)));
    if (previous >= 0) setSpin(previous, false);
    setSpin(index, true);
    if (count) count.textContent = `${index + 1} / ${cards.length}`;
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === cards.length - 1;
    // While flicking past several records, only the one you land on updates
    // the text below (and Mèo), so it doesn't flicker.
    clearTimeout(selectTimer);
    const fire = () => onSelect(index, cards[index], viaScroll);
    if (previous < 0 || !viaScroll) fire();
    else selectTimer = window.setTimeout(fire, 140);
  }

  function scrollToIndex(index: number, smooth = true) {
    const i = clamp(index, 0, cards.length - 1);
    const left = clamp(centers[i] - half, 0, rack.scrollWidth - rack.clientWidth);
    if (Math.abs(rack.scrollLeft - left) < 2) return;
    programmatic = left;
    clearTimeout(programmaticTimer);
    programmaticTimer = window.setTimeout(endProgrammatic, 1200);
    rack.scrollTo({ left, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
  }

  rack.addEventListener(
    'scroll',
    () => {
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  rack.addEventListener('scrollend', endProgrammatic);
  // A finger on the rack takes over from any programmatic scroll.
  rack.addEventListener('pointerdown', endProgrammatic, { passive: true });

  cards.forEach((card, i) => {
    card.addEventListener('click', () => {
      // Update the text right away; the scroll catches up visually.
      if (i !== selected) choose(i, false);
      scrollToIndex(i);
    });
  });
  prev?.addEventListener('click', () => {
    choose(Math.max(0, selected - 1), false);
    scrollToIndex(selected);
  });
  next?.addEventListener('click', () => {
    choose(Math.min(cards.length - 1, selected + 1), false);
    scrollToIndex(selected);
  });
  rack.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const target = clamp(selected + (event.key === 'ArrowRight' ? 1 : -1), 0, cards.length - 1);
    cards[target].focus({ preventScroll: true });
    cards[target].click();
  });

  new ResizeObserver(() => {
    measure();
    paint();
  }).observe(rack);

  measure();
  const fromHash = cards.findIndex((c) => `#${c.dataset.record}` === decodeURIComponent(location.hash));
  if (fromHash > 0) scrollToIndex(fromHash, false);
  paint();

  return { scrollToIndex };
}
