import { defineConfig } from 'astro/config';

export default defineConfig({
  // Leaflet is only imported when a route map is opened; listing it here makes the dev server prepare it at
  // start-up instead of the first time it is requested (which fails if it was installed while the server ran).
  vite: { optimizeDeps: { include: ['leaflet'] } },
});
