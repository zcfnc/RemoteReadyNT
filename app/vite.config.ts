import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [],
      manifest: {
        name: 'RemoteReady NT',
        short_name: 'RemoteReady NT',
        description: 'Emergency connectivity and preparedness exercise.',
        theme_color: '#07334e',
        background_color: '#edf3f5',
        display: 'standalone',
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,json,geojson,svg}'],
        // The raw point export is intentionally loaded on demand because it is
        // ~9 MB; the lighter track export remains precached for offline maps.
        globIgnores: ['**/bom-tropical-cyclone-points.geojson'],
        navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'map-tiles', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 } },
        }],
      },
    }),
  ],
});
