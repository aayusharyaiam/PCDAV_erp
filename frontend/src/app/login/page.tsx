'use client';
import { FormEvent, useState } from 'react';
import { login } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try { const result = await login(email, password); window.location.href = result.user.mustChangePassword ? '/change-password' : '/dashboard'; }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); }
    finally { setLoading(false); }
  }
  return <main className="login-page">
    <section className="login-visual"><div className="eyebrow" style={{color:'white'}}>PCDAV ERP</div><h1>Clear school operations, one trusted record.</h1><p>A secure workspace for admissions, student history, classrooms, and fees.</p></section>
    <section className="login-card-wrap"><div className="login-card"><div className="eyebrow">Secure staff access</div><h2>Welcome back</h2><p>Sign in with your school staff account.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <form className="login-form" onSubmit={submit}>
        <div className="form-field"><label htmlFor="email">Email address</label><input className="input" id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></div>
        <div className="form-field"><label htmlFor="password">Password</label><input className="input" id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></div>
        <button className="button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'}</button>
      </form><p className="login-help">Contact your administrator if you need your account reset.</p>
    </div></section>
  </main>;
}
