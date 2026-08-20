import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediaOps Copilot — Ops Console',
  description:
    'Routes, retrieves, reasons, verifies, learns and explains — a self-optimizing support agent for a render pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
