import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const BACKEND_DOWN_MESSAGE = "Can't reach the server. Is the backend running?"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The frontend calls /api/login; Flask receives /login.
      '/api': {
        target: 'http://localhost:5555',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          // When Flask isn't running, answer with a JSON error the app can show.
          proxy.on('error', (err, req, res) => {
            if (res.headersSent) return
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: BACKEND_DOWN_MESSAGE }))
          })
        },
      },
    },
  },
})
