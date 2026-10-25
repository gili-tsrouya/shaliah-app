import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Served from https://gili-tsrouya.github.io/shaliah-app/
  base: '/shaliah-app/',
  // Shown in Settings so we can tell which version a phone is running
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'השליח',
        short_name: 'השליח',
        description: 'יד ימין לשליחות ולחיים בניו ג׳רזי',
        lang: 'he',
        dir: 'rtl',
        display: 'standalone',
        start_url: '/shaliah-app/',
        scope: '/shaliah-app/',
        background_color: '#F3F5F9',
        theme_color: '#F3F5F9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Feeds are refreshed by the daily agents, so always try the network first.
        runtimeCaching: [
          { urlPattern: /\/feeds\/.*\.json$/, handler: 'NetworkFirst' },
        ],
      },
    }),
  ],
})
