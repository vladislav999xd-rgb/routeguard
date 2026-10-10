import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/static/app/',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../backend_static/app', emptyOutDir: true, sourcemap: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
