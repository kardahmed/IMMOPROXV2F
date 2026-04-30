// Shared react-query client. Was previously inlined in main.tsx; we
// extract it so non-component code (zustand stores, side-effect
// callbacks) can call `queryClient.removeQueries()` directly. The
// super-admin store needs this to purge cached queries from a
// previously inspected tenant before showing data from another.

import { QueryClient } from '@tanstack/react-query'
import { handleQueryError } from '@/lib/errors'

export const queryClient = new QueryClient({
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
