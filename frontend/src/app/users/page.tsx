'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, Role, User } from '@/lib/api';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';

export default function UsersPage() {
  const [actor, setActor] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ACCOUNTANT' as Role });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api<{ items: User[] }>('/users?limit=100')
    .then(result => setUsers(result.items))
    .catch(e => setError(e instanceof Error ? e.message : 'Unable to load accounts'));

  useEffect(() => {
    const stored = window.localStorage.getItem('pcdav_user');
    if (stored) setActor(JSON.parse(stored) as User);
    void load();
  }, []);

  const canCreate = actor?.role === 'SUPERADMIN' || actor?.role === 'ADMIN';
  const roles: Role[] = actor?.role === 'SUPERADMIN' ? ['ADMIN'] : ['ADMIN', 'ACCOUNTANT', 'TEACHER'];

  useEffect(() => {
    if (!roles.includes(form.role)) setForm(current => ({ ...current, role: roles[0] ?? 'ACCOUNTANT' }));
  }, [actor?.role]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setSuccess(`${form.role} account created.`);
      setForm({ name: '', email: '', password: '', role: roles[0] ?? 'ACCOUNTANT' });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create account'); }
    finally { setLoading(false); }
  }

  async function deactivate(user: User) {
    const reason = window.prompt(`Reason for deactivating ${user.name}`); if (!reason) return;
    try { await api(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ version: user.version, active: false, reason }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update account'); }
  }

  return <AppShell>
    <PageHeader eyebrow="Administration" title="Users & roles" description="Provision accounts according to the Superadmin → Admin → Accountant/Teacher hierarchy." />
    {error && <div className="notice error">{error}</div>}
    {success && <div className="notice success">{success}</div>}
    <div className="split-grid">
      <section className="panel">
        <div className="panel-header"><div><h2>Create account</h2><span>{actor?.role === 'SUPERADMIN' ? 'Superadmin provisions Admins' : 'Admin provisions school staff'}</span></div></div>
        {canCreate ? <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-field"><label>Name</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-field"><label>Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="form-field"><label>Temporary password</label><input className="input" type="password" minLength={12} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></div>
            <div className="form-field"><label>Account category</label><select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></div>
          </div>
          <div className="form-actions"><button className="button" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button></div>
        </form> : <EmptyState title="Account management unavailable" detail="Your current account does not have account-provisioning access." />}
      </section>
      <section className="panel">
        <div className="panel-header"><div><h2>Permission model</h2><span>Changes are audited</span></div></div>
        <div className="permission-list">
          <div><strong>Superadmin</strong><span>Full operations · manages Admin accounts</span></div>
          <div><strong>Admin</strong><span>Creates staff · fee plans · school finance</span></div>
          <div><strong>Accountant</strong><span>Fee accounting · receipts · reconciliation</span></div>
          <div><strong>Teacher</strong><span>Assigned classroom · attendance · Promote/Retain</span></div>
        </div>
      </section>
    </div>
    <section className="panel section-panel">
      <div className="panel-header"><div><h2>Staff accounts</h2><span>{users.length} visible accounts</span></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>
        {users.map(user => <tr key={user.id}><td className="primary-text">{user.name}</td><td>{user.email}</td><td>{user.role}</td><td><StatusBadge status={user.active ? 'ACTIVE' : 'INACTIVE'} /></td><td className="muted">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : '—'}</td><td>{user.active && user.id !== actor?.id && user.role !== 'SUPERADMIN' && (actor?.role === 'SUPERADMIN' || user.role !== 'ADMIN') && <button className="text-button danger-text" onClick={() => void deactivate(user)}>Deactivate</button>}</td></tr>)}
      </tbody></table>{!users.length && <EmptyState title="No accounts found" detail="Create the first account for this school." />}</div>
    </section>
  </AppShell>;
}
