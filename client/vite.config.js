import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the React app runs on :5173 and forwards /api calls to the
// Express server on :4000, so both share one origin and no CORS is needed.
export default defineConfig({
  plugins: [react()],
  // The service worker reads this list to keep every screen on the phone for use offline.
  build: { manifest: 'asset-manifest.json' },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
