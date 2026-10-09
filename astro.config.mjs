import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quote.info-myview.co.kr',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/preview'),
    }),
  ],
  build: {
    format: 'directory',
  },
});
