'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/** Route-level error boundary: the shell stays usable and the user can retry in place. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center space-y-3" role="alert">
        <p className="microlabel text-danger-500">Something went wrong</p>
        <h1 className="page-title">This page couldn&apos;t load</h1>
        <p className="text-sm text-surface-600">
          Your data is safe — nothing was saved halfway. Try again, and if it keeps happening, reload the app.
        </p>
        {error.digest && <p className="text-2xs text-surface-400 font-mono">Reference: {error.digest}</p>}
        <div className="pt-2 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">Try again</button>
          <Link href="/dashboard" className="btn-secondary">Go to dashboard</Link>
        </div>
      </div>
    </main>
  )
}
