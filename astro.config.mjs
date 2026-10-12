// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  trailingSlash: 'always',
  // Prefetch links as they scroll into view, so taps on a phone open instantly.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
});
