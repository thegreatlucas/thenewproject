import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { CryptoProvider } from '@/lib/cryptoContext'
import { ThemeProvider } from '@/lib/themeContext'
import { FinanceGroupProvider } from '@/lib/financeGroupContext'
import { Toaster } from 'sonner'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'The Rich Couple',
  description: 'Gerenciador financeiro do casal',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'The Rich Couple',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2ecc71',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});})}`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          <CryptoProvider>
            <FinanceGroupProvider>
              {children}
              <Toaster
                position="top-center"
                richColors
                closeButton
                toastOptions={{
                  className: 'theme-card',
                }}
              />
            </FinanceGroupProvider>
          </CryptoProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
