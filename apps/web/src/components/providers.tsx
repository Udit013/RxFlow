'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { warmUpApi } from '@/lib/api'
import { useRegion } from '@/lib/region'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            // Retry once for network/5xx blips, never for 4xx — a 403/404/422 won't change on
            // retry and just doubles the wait before the user sees the error.
            retry: (failureCount, error) => {
              const status = (error as { response?: { status?: number } })?.response?.status
              if (status && status >= 400 && status < 500) return false
              return failureCount < 1
            },
          },
        },
      })
  )

  // Every entry point (login, register, dashboard) starts the API waking immediately.
  useEffect(() => { warmUpApi() }, [])

  // <html lang> follows the pharmacy's locale so screen readers pronounce text correctly.
  const { locale } = useRegion()
  useEffect(() => { document.documentElement.lang = locale }, [locale])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
