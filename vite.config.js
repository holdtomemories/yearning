import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ping',
        short_name: 'Ping',
        description: 'Say it. Ping it.',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-1922.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-5122.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})