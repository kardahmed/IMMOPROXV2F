import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Manual chunk splitting to improve caching and reduce initial bundle size.
        // Heavy vendor libs that change less often than app code go in their own chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router') || /\/node_modules\/react(-dom)?\//.test(id)) return 'react-vendor'
          if (id.includes('@tanstack/react-query')) return 'query-vendor'
          if (id.includes('date-fns')) return 'date-vendor'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) return 'form-vendor'
          if (id.includes('i18next')) return 'i18n-vendor'
          if (id.includes('@react-pdf')) return 'pdf-vendor'
          if (id.includes('@dnd-kit')) return 'dnd-vendor'
          return undefined
        },
      },
    },
    // Raise the "large chunk" warning slightly since recharts is unavoidable.
    chunkSizeWarningLimit: 600,
  },
})
