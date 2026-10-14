'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, PageHeader } from '@/components/AppShell';
import { api, toPaise } from '@/lib/api';
import { FinancialPolicy } from '@/lib/finance';
import { inputAmount, messageOf } from '@/lib/payments';

export default function PolicyPage() { return <AppShell><Policy /></AppShell>; }
function Policy() {
  const [policy, setPolicy] = useState<FinancialPolicy | null>(null);
  const [bounce, setBounce] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { const data = await api<FinancialPolicy>('/finance/policy'); setPolicy(data); setBounce(inputAmount(data.bounceFeeMinor)); setReason(''); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!policy || busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const { schoolId: _schoolId, ...mutable } = policy;
      const result = await api<FinancialPolicy>('/finance/policy', { method: 'POST', body: JSON.stringify({ ...mutable, bounceFeeMinor: toPaise(bounce), reason: reason.trim() }) });
      setPolicy(result); setBounce(inputAmount(result.bounceFeeMinor)); setReason(''); setNotice(`Demo policy saved · version ${result.version}. Existing quotes may need to be recreated.`);
    } catch (e) { setError(`${messageOf(e)}. Reload server policy before editing again if the version changed or the outcome is uncertain.`); }
    finally { setBusy(false); }
  }
  return <><PageHeader title="Demo financial policy" description="Admin-configurable synthetic testing rules. These are not approved real-school financial rules." action={<button className="button secondary" disabled={busy} onClick={() => void load()}>Reload server policy</button>} />
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {policy && <section className="panel"><p>Version {policy.version} · Prefix/scope changes preserve old receipt snapshots and issued numbers.</p><form onSubmit={save}><fieldset className="form-grid" disabled={busy}>
      <div className="form-field"><label htmlFor="receipt-prefix">Receipt prefix</label><input className="input" id="receipt-prefix" value={policy.receiptPrefix} onChange={e => setPolicy({ ...policy, receiptPrefix: e.target.value })} required maxLength={40} /></div>
      <div className="form-field"><label htmlFor="receipt-scope">Receipt sequence scope</label><select className="select" id="receipt-scope" value={policy.receiptScope} onChange={e => setPolicy({ ...policy, receiptScope: e.target.value as FinancialPolicy['receiptScope'] })}><option value="SCHOOL">School</option><option value="FINANCIAL_YEAR">Financial year</option></select></div>
      <label><input type="checkbox" checked={policy.allowAdvance} onChange={e => setPolicy({ ...policy, allowAdvance: e.target.checked })} /> Allow advance credit</label>
      <label><input type="checkbox" checked={policy.blockPreviousSession} onChange={e => setPolicy({ ...policy, blockPreviousSession: e.target.checked })} /> Block new-session allocations while previous-session dues remain</label>
      <div className="form-field"><label htmlFor="bounce-fee">Demo bounce fee ₹</label><input className="input" id="bounce-fee" type="number" min="0" step="0.01" value={bounce} onChange={e => setBounce(e.target.value)} required /></div>
      <div className="form-field full"><label htmlFor="policy-reason">Policy change reason</label><textarea className="textarea" id="policy-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={500} required /></div>
    </fieldset><div className="form-actions"><button className="button" disabled={busy}>Save demo policy</button></div></form></section>}
  </>;
}
