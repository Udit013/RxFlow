'use client'

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the whole document,
 * so it can't rely on the app's stylesheet — styles are inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f2f0ea', color: '#1f1f1b' }}>
        <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div role="alert" style={{ maxWidth: 420, background: '#fdfcf9', border: '1px solid #e5e2d8', padding: 32, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>RxFlow couldn&apos;t start</h1>
            <p style={{ fontSize: 14, color: '#57564e', margin: '0 0 16px' }}>
              Your data is safe. Try again, or reload the page in a moment.
            </p>
            {error.digest && <p style={{ fontSize: 11, color: '#a3a094', fontFamily: 'monospace' }}>Reference: {error.digest}</p>}
            <button
              onClick={reset}
              style={{ background: '#1f1f1b', color: '#fdfcf9', border: 0, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
