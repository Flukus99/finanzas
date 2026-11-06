import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// En desarrollo, Vite (puerto 5173) reenvía la API a PocketBase (8090).
// En producción, `npm run build` deja la app en backend/pb_public y PocketBase la sirve.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Finanzas',
        short_name: 'Finanzas',
        description: 'Mis finanzas personales',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#f2f4f3',
        theme_color: '#0d7a64',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/_\//] },
    }),
  ],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: true },
    },
  },
  build: { outDir: '../backend/pb_public', emptyOutDir: true },
})
