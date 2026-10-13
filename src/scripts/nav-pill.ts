/**
 * The yellow pill behind the current tab.
 *
 * Tapping a tab moves the pill there immediately (FLIP + spring), while the
 * next page is still being fetched, so the tap answers at once instead of
 * waiting on the network. When the view transition then runs, the browser's
 * `tab-pill` / `nav-pill` morph carries on from wherever the pill is.
 *
 * Tapping the tab you're already on scrolls back to the top, like iOS.
 */
import { Spring } from './spring';

function glide(pill: HTMLElement, index: number) {
  const first = pill.getBoundingClientRect().left;
  pill.style.setProperty('--i', String(index));
  const last = pill.getBoundingClientRect().left;
  const x = new Spring(
    first - last,
    (v) => {
      pill.style.transform = Math.abs(v) < 0.3 ? '' : `translate3d(${v.toFixed(2)}px, 0, 0)`;
    },
    { response: 0.34, precision: 0.3 },
  );
  // Paint the old position in this same frame, then glide to the new one.
  x.repaint();
  x.to(0);
}

export function installNavPill() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-nav-link]');
      const nav = link?.closest('nav');
      if (!link || !nav) return;

      if (new URL(link.href).pathname === location.pathname) {
        event.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        return;
      }

      const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[data-nav-link]'));
      links.forEach((other) => {
        if (other === link) other.setAttribute('aria-current', 'page');
        else other.removeAttribute('aria-current');
      });
      const pill = nav.querySelector<HTMLElement>('[data-pill]');
      if (pill) glide(pill, links.indexOf(link));
    },
    // Capture: runs before Astro's router, so a same-page tap can be cancelled.
    true,
  );
}
