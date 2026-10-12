/**
 * Trung's library. Adding something = adding one Markdown file.
 * See README.md for the fields; the build fails loudly if a required one is
 * missing or misspelled.
 */
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const colour = z.enum(['green', 'yellow', 'pink', 'purple', 'blue', 'sand']);

const composers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/composers' }),
  schema: z.object({
    name: z.string(),
    /** Short name for the sleeve, e.g. "Chopin". Defaults to the last word of name. */
    shortName: z.string().optional(),
    born: z.number().int(),
    died: z.number().int().optional(),
    era: z.enum(['baroque', 'classical', 'romantic', 'modern', 'contemporary']),
    sleeveColor: colour.default('green'),
    intro: z.string(),
    /** What Mèo says on this composer's page. */
    catLine: z.string().optional(),
  }),
});

const works = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/works' }),
  schema: z.object({
    composer: reference('composers'),
    title: z.string(),
    catalogue: z.string().optional(),
    form: z.string().optional(),
    recording: z
      .object({
        performer: z.string(),
        year: z.number().int().optional(),
        label: z.string().optional(),
      })
      .optional(),
    links: z
      .object({
        spotify: z.url().optional(),
        youtube: z.url().optional(),
        appleMusic: z.url().optional(),
      })
      .default({}),
    addedAt: z.coerce.date(),
    favorite: z.boolean().default(false),
    catLine: z.string().optional(),
  }),
});

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    addedAt: z.coerce.date(),
    status: z.enum(['reading', 'read', 'want']).default('read'),
    quote: z.string().optional(),
    spineColor: colour.optional(),
    catLine: z.string().optional(),
  }),
});

export const collections = { composers, works, books };
