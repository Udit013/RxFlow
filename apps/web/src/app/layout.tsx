import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import { SplashScreen } from '@/components/splash-screen'

// Display voice — headings, wordmark, big numbers on auth screens.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
})

// Working voice — dense, engineered UI text.
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
})

// Record voice — every invoice number, batch code, and ₹ amount.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#052220', // brand-950 — matches the sidebar / splash mark
}

export const metadata: Metadata = {
  title: { default: 'RxFlow', template: '%s | RxFlow' },
  description: 'Connected Pharma Distribution Network — Modern pharmacy management & medicine distribution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} font-sans antialiased bg-surface-100 text-surface-900`}>
        {/* Without JS the splash could never lift — hide it outright. */}
        <noscript>
          <style>{'#rx-splash{display:none!important}'}</style>
        </noscript>
        <SplashScreen />
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
