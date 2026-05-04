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
          if (id.includes('@tanstack/react-virtual')) return 'virtual-vendor'
          if (id.includes('date-fns')) return 'date-vendor'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) return 'form-vendor'
          if (id.includes('i18next')) return 'i18n-vendor'
          if (id.includes('@dnd-kit')) return 'dnd-vendor'
          // Chart libraries (~400KB recharts + d3 internals). Pulling
          // these into their own chunk means the dashboard chunk —
          // which used to bundle them transitively because RevenueChart
          // is statically imported — drops below 100KB. Pages that
          // never render a chart (login, auth, redirects) never load
          // this chunk at all.
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('/victory-')) return 'charts-vendor'
          // PDF / canvas libs only used by AI-suggestions PDF export
          // and screenshots. Already lazy-loaded by their consumers;
          // isolating them here keeps the parent chunks small.
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor'
          return undefined
        },
      },
    },
    // Raise the "large chunk" warning slightly since recharts is unavoidable.
    chunkSizeWarningLimit: 600,
  },
})
