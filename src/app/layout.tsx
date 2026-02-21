import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TheNext3D — Make Your 3D Models Production-Ready',
  description: 'Analyze, inspect, and optimize your GLB files for web & mobile. Check triangle count, textures, draw calls, and export production-ready models. Free & open source.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ scrollBehavior: 'smooth' }}>
      <body>{children}</body>
    </html>
  );
}
