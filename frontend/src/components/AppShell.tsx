'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api, logout, Role, User } from '@/lib/api';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER'] },
  { href: '/applications', label: 'Admissions', icon: '↗', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/students', label: 'Students', icon: '◉', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER'] },
  { href: '/academic', label: 'Academic setup', icon: '▦', roles: ['SUPERADMIN', 'ADMIN', 'TEACHER'] },
  { href: '/users', label: 'Users & roles', icon: '♙', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/audit', label: 'Audit history', icon: '◌', roles: ['SUPERADMIN', 'ADMIN'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem('pcdav_user');
    if (stored) setUser(JSON.parse(stored) as User);
    api<{ user: User }>('/auth/me').then(result => { setUser(result.user); window.localStorage.setItem('pcdav_user', JSON.stringify(result.user)); if (result.user.mustChangePassword && pathname !== '/change-password') window.location.replace('/change-password'); }).catch(() => setOffline(true));
  }, []);
  if (!mounted || !user) return <div className="center-page"><div className="spinner" /><p>Loading secure workspace…</p></div>;
  const allowed = links.filter(link => user && link.roles.includes(user.role));
  return <div className="app-layout">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">P</div><div><strong>PCDAV ERP</strong><span>School workspace</span></div></div>
      <div className="context-chip"><span className="status-dot" /> P DAV PUBLIC SCHOOL<span className="context-session">2026–27</span></div>
      <nav className="nav-list">{allowed.map(link => <Link className={`nav-link ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'active' : ''}`} href={link.href} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="implementation-note"><span>LEVEL 1–2</span><p>Foundation and student lifecycle</p></div><button className="logout-link" onClick={() => void logout()}>↪ Sign out</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>☰</button><div className="breadcrumbs">P DAV PUBLIC SCHOOL <span>/</span> Staff workspace</div><div className="top-actions">{offline && <span className="offline-badge">API reconnecting</span>}<div className="user-pill"><div className="avatar">{user?.name.charAt(0)}</div><div><strong>{user?.name}</strong><span>{roleLabel(user?.role)}</span></div></div></div></header>
      {menuOpen && <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}><nav className="mobile-menu" aria-label="Mobile navigation" onClick={event => event.stopPropagation()}><div className="mobile-menu-header"><strong>PCDAV ERP</strong><button aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button></div>{allowed.map(link => <Link className={`nav-link ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'active' : ''}`} href={link.href} onClick={() => setMenuOpen(false)} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}</nav></div>}
      <div className="content">{children}</div>
    </main>
  </div>;
}

function roleLabel(role?: Role) { return role ? role.charAt(0) + role.slice(1).toLowerCase() : 'Loading'; }

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow ?? 'PCDAV ERP'}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div>{action}</div>}</div>;
}

export function StatCard({ label, value, detail, tone = 'blue' }: { label: string; value: string | number; detail: string; tone?: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{tone === 'blue' ? '◆' : tone === 'green' ? '✓' : tone === 'amber' ? '◒' : '◎'}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }

export function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><div className="empty-icon">□</div><strong>{title}</strong><p>{detail}</p></div>; }

export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status.toLowerCase().replaceAll('_', '-')}`}>{status.replaceAll('_', ' ')}</span>; }
