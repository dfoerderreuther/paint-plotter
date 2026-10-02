import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Local-only app: one big bundle (antd) is fine.
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    // 5173 is used by another local project.
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
