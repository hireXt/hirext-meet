import '../styles/globals.css';
import '../styles/ailink.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/lib/ThemeProvider';

export const metadata: Metadata = {
  title: {
    default: 'HireXt Meet | Secure AI-powered video meetings',
    template: '%s | HireXt Meet',
  },
  description:
    'HireXt Meet is an AI-native video meeting platform with secure real-time connections, screen sharing, chat and recording.',
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: {
      rel: 'icon',
      url: '/favicon.ico',
    },
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/images/livekit-apple-touch.png',
        sizes: '180x180',
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f8fb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeProvider>
          <Toaster />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}