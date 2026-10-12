import { getCollection, type CollectionEntry } from 'astro:content';

export type Composer = CollectionEntry<'composers'>;
export type Work = CollectionEntry<'works'>;
export type Book = CollectionEntry<'books'>;

export const ERA_ORDER = ['baroque', 'classical', 'romantic', 'modern', 'contemporary'] as const;
export const ERA_LABEL: Record<Composer['data']['era'], string> = {
  baroque: 'Baroque',
  classical: 'Cổ điển',
  romantic: 'Lãng mạn',
  modern: 'Hiện đại',
  contemporary: 'Đương đại',
};

export const shortName = (c: Composer) => c.data.shortName ?? c.data.name.split(' ').at(-1)!;
export const lifespan = (c: Composer) => `${c.data.born}–${c.data.died ?? ''}`;

export async function getComposers() {
  const all = await getCollection('composers');
  return all.sort(
    (a, b) => ERA_ORDER.indexOf(a.data.era) - ERA_ORDER.indexOf(b.data.era) || a.data.born - b.data.born,
  );
}

export async function getWorks(composerId?: string) {
  const all = await getCollection('works', (w) => !composerId || w.data.composer.id === composerId);
  // Favourites first, then newest additions.
  return all.sort((a, b) => Number(b.data.favorite) - Number(a.data.favorite) || +b.data.addedAt - +a.data.addedAt);
}

export async function getRecentWorks(limit = 5) {
  const all = await getCollection('works');
  return all.sort((a, b) => +b.data.addedAt - +a.data.addedAt).slice(0, limit);
}

/** Small, stable string hash (FNV-1a). */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The shelf has no categories: books sit in a "random" order that is stable
 * (sorted by a hash of their id). A new book slots in somewhere, and the
 * others keep their places.
 */
export async function getShelf() {
  const all = await getCollection('books');
  return all.sort((a, b) => hash(a.id) - hash(b.id));
}

const SPINE_COLOURS = ['green', 'yellow', 'pink', 'purple', 'blue', 'sand'] as const;

export function spineLook(book: Book) {
  const h = hash(`${book.id}:spine`);
  return {
    colour: book.data.spineColor ?? SPINE_COLOURS[h % SPINE_COLOURS.length],
    height: 128 + (h >>> 3) % 44, // 128–171px
    width: 36 + (h >>> 9) % 16, // 36–51px
    band: (h >>> 14) % 3, // decoration style
  };
}

export async function lastUpdated() {
  const [works, books] = await Promise.all([getCollection('works'), getCollection('books')]);
  const dates = [...works, ...books].map((e) => +e.data.addedAt);
  return new Date(dates.length ? Math.max(...dates) : Date.now());
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Direct links when given; otherwise a search on each platform. */
export function listenLinks(work: Work, composer: Composer) {
  const q = [shortName(composer), work.data.title, work.data.catalogue, work.data.recording?.performer]
    .filter(Boolean)
    .join(' ');
  const enc = encodeURIComponent(q);
  const l = work.data.links;
  return [
    { platform: 'Spotify', href: l.spotify ?? `https://open.spotify.com/search/${enc}`, direct: !!l.spotify },
    { platform: 'YouTube', href: l.youtube ?? `https://www.youtube.com/results?search_query=${enc}`, direct: !!l.youtube },
    { platform: 'Apple Music', href: l.appleMusic ?? `https://music.apple.com/search?term=${enc}`, direct: !!l.appleMusic },
  ];
}
