import Link from 'next/link'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-surface-100">
      <div className="card max-w-md w-full p-8 text-center space-y-3">
        <p className="microlabel text-brand-600">404</p>
        <h1 className="page-title">This page doesn&apos;t exist</h1>
        <p className="text-sm text-surface-600">The link may be old, or the record may have been removed or belong to another pharmacy.</p>
        <div className="pt-2 flex justify-center gap-2">
          <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
          <Link href="/dashboard/medicines" className="btn-secondary">Medicines</Link>
        </div>
      </div>
    </main>
  )
}
