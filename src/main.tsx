import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { handleQueryError } from '@/lib/errors'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CookieConsent } from '@/components/common/CookieConsent'
import '@/i18n'
import './index.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
    mutations: {
      onError: handleQueryError,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <CookieConsent />
          <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#0F1830',
              color: '#EDF4FC',
              border: '1px solid #1E325A',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#00D4A0', secondary: '#0F1830' },
            },
            error: {
              iconTheme: { primary: '#FF4949', secondary: '#0F1830' },
            },
          }}
        />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
