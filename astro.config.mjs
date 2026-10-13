// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  trailingSlash: 'always',
  // Prefetch links as they scroll into view, so taps on a phone open instantly.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  // CSS is small; inlining it means a prefetched page is complete on its own,
  // so a tab switch never waits on a stylesheet request.
  build: { inlineStylesheets: 'always' },
});
