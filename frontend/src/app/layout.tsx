import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'PCDAV ERP', description: 'School office ERP workspace' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
