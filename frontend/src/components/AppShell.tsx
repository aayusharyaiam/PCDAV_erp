'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, ApiError, logout, Role, User } from '@/lib/api';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER'] },
  { href: '/applications', label: 'Admissions', icon: '↗', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/students', label: 'Students', icon: '◉', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER'] },
  { href: '/academic', label: 'Academic setup', icon: '▦', roles: ['SUPERADMIN', 'ADMIN', 'TEACHER'] },
  { href: '/attendance', label: 'Attendance', icon: '✓', roles: ['SUPERADMIN', 'ADMIN', 'TEACHER'] },
  { href: '/attendance/corrections', label: 'Attendance corrections', icon: '↺', roles: ['SUPERADMIN', 'ADMIN', 'TEACHER'] },
  { href: '/promotion', label: 'Promote / Retain', icon: '→', roles: ['SUPERADMIN', 'ADMIN', 'TEACHER'] },
  { href: '/lifecycle/withdrawals', label: 'Withdraw / strike off', icon: '↘', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/lifecycle/transfer-readmission', label: 'Transfer / readmission', icon: '⇄', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/fees/plans', label: 'Fee plans', icon: '₹', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/fees/ledger', label: 'Fee ledger', icon: '₿', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/fees/collect', label: 'Collect payment', icon: '＋', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/receipts', label: 'Receipts', icon: '▤', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/cashier', label: 'Cashier shifts', icon: '◒', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/finance/requests', label: 'Approval inbox', icon: '✓', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/finance/policy', label: 'Demo financial policy', icon: '⚙', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/reports', label: 'Financial reports', icon: '▦', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/reports/operations', label: 'Store reports', icon: '▤', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/reports/enrollment', label: 'Enrollment reports', icon: '◉', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/statements', label: 'Student statement', icon: '▤', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/services', label: 'Transport & hostel', icon: '⌂', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/transport', label: 'Transport management', icon: '▰', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/store', label: 'Store management', icon: '▤', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/imports', label: 'Import data', icon: '⇧', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/users', label: 'Users & roles', icon: '♙', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/audit', label: 'Audit history', icon: '◌', roles: ['SUPERADMIN', 'ADMIN'] },
];

const StaffContext = createContext<User | null>(null);
export function useStaffUser(): User {
  const user = useContext(StaffContext);
  if (!user) throw new Error('Staff workspace must be inside AppShell');
  return user;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    setOffline(false);
    api<{ user: User; csrfToken: string }>('/auth/me').then(result => {
      if (cancelled) return;
      window.localStorage.setItem('pcdav_user', JSON.stringify(result.user));
      window.localStorage.setItem('pcdav_csrf', result.csrfToken);
      if (result.user.mustChangePassword && pathname !== '/change-password') { window.location.replace('/change-password'); return; }
      setUser(result.user);
    }).catch((error: ApiError) => { if (!cancelled && error.status !== 401) setOffline(true); });
    return () => { cancelled = true; };
  }, [attempt, pathname]);
  if (!mounted || !user) return <div className="center-page">{offline ? <><p role="alert">Backend unavailable. Your work has not been submitted.</p><button className="button" onClick={() => setAttempt(value => value + 1)}>Retry connection</button></> : <><div className="spinner" /><p>Checking secure session…</p></>}</div>;
   const protectedLink = [...links].sort((a, b) => b.href.length - a.href.length).find(link => pathname === link.href || pathname.startsWith(`${link.href}/`));
  if (protectedLink && !protectedLink.roles.includes(user.role)) return <div className="center-page"><h1>Access restricted</h1><p>This page is not available for your account.</p><Link href="/dashboard" className="button">Back to dashboard</Link></div>;
  const allowed = links.filter(link => user && link.roles.includes(user.role));
  return <div className="app-layout">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">P</div><div><strong>PCDAV ERP</strong><span>School workspace</span></div></div>
      <div className="context-chip"><span className="status-dot" /> P DAV PUBLIC SCHOOL<span className="context-session">2026–27</span></div>
      <nav className="nav-list">{allowed.map(link => <Link className={`nav-link ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'active' : ''}`} href={link.href} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}</nav>
       <div className="sidebar-bottom"><div className="implementation-note"><span>CORE ERP</span><p>Student lifecycle, academics, fee accounting, payment collection, and operations</p></div><button className="logout-link" onClick={() => void logout()}>↪ Sign out</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>☰</button><div className="breadcrumbs">P DAV PUBLIC SCHOOL <span>/</span> Staff workspace</div><div className="top-actions">{offline && <span className="offline-badge">API reconnecting</span>}<div className="user-pill"><div className="avatar">{user?.name.charAt(0)}</div><div><strong>{user?.name}</strong><span>{roleLabel(user?.role)}</span></div></div></div></header>
      {menuOpen && <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}><nav className="mobile-menu" aria-label="Mobile navigation" onClick={event => event.stopPropagation()}><div className="mobile-menu-header"><strong>PCDAV ERP</strong><button aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button></div>{allowed.map(link => <Link className={`nav-link ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'active' : ''}`} href={link.href} onClick={() => setMenuOpen(false)} key={link.href}><span>{link.icon}</span>{link.label}</Link>)}<button className="logout-link" onClick={() => void logout()}>Sign out</button></nav></div>}
      <div className="content"><div className="notice demo-banner"><strong>DEMO · Synthetic data only</strong><p>Financial rules are configurable demo defaults. Real-school rates, bank execution, and production use are not approved.</p></div><StaffContext.Provider value={user}>{user.role !== 'TEACHER' && <ApprovalNotification />}{children}</StaffContext.Provider></div>
    </main>
  </div>;
}

function ApprovalNotification() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { api<{ total: number }>('/finance/requests?status=REQUESTED&page=1&limit=1').then(r => { if (active) setCount(r.total); }).catch(() => { if (active) setCount(null); }); };
    refresh(); const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('finance-requests-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('finance-requests-changed', refresh); };
  }, []);
  return <p className="approval-notification"><Link className="text-link" href="/finance/requests">Approval inbox · {count === null ? 'count unavailable' : `${count} requested`}</Link></p>;
}

function roleLabel(role?: Role) { return role ? role.charAt(0) + role.slice(1).toLowerCase() : 'Loading'; }

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow ?? 'PCDAV ERP'}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div>{action}</div>}</div>;
}

export function StatCard({ label, value, detail, tone = 'blue' }: { label: string; value: string | number; detail: string; tone?: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{tone === 'blue' ? '◆' : tone === 'green' ? '✓' : tone === 'amber' ? '◒' : '◎'}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }

export function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><div className="empty-icon">□</div><strong>{title}</strong><p>{detail}</p></div>; }

export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status.toLowerCase().replaceAll('_', '-')}`}>{status.replaceAll('_', ' ')}</span>; }
