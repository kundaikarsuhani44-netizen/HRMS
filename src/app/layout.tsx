import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Kinara HR', template: '%s · Kinara HR' },
  description: 'HRMS for Konkan Coastal Foods — employees, attendance, leave and an HR assistant.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a4654' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const body = <html lang="en-IN"><body>{children}</body></html>;
  if ((process.env.AUTH_MODE === 'demo' || process.env.AUTH_MODE === 'password')) return body;
  const { ClerkProvider } = await import('@clerk/nextjs');
  return <ClerkProvider>{body}</ClerkProvider>;
}
