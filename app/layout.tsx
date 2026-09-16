import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import '../styles/globals.css';
import '../styles/ailink.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/lib/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'meeXt | Secure premium video meetings',
    template: '%s | meeXt',
  },
  description:
    'meeXt is a secure real-time video meeting platform with HD video, screen sharing, chat, and recording.',
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        url: '/favicon.svg?v=meet-3',
      },
      {
        rel: 'icon',
        type: 'image/x-icon',
        url: '/favicon.ico?v=meet-3',
      },
    ],
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/apple-touch-icon.png?v=meet-3',
        sizes: '180x180',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          <Toaster
            containerClassName="ail-toast-viewport"
            toastOptions={{
              className: 'ail-toast',
              duration: 5000,
            }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}