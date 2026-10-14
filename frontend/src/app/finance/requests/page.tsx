'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { api, rupees } from '@/lib/api';
import { CorrectionRequest, useFrozenCommand } from '@/lib/finance';
import { allItems, canCorrectPayments, ListResponse, messageOf } from '@/lib/payments';

export default function RequestsPage() { return <AppShell><Inbox /></AppShell>; }
function Inbox() {
  const user = useStaffUser();
  const admin = canCorrectPayments(user.role);
  const [status, setStatus] = useState('REQUESTED');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse<CorrectionRequest> | null>(null);
  const [selected, setSelected] = useState<CorrectionRequest | null>(null);
  const [decision, setDecision] = useState('approve');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const recovery = useFrozenCommand<{ reason: string }>(`pcdav_request_decision:${user.schoolId}:${user.id}`, s => /^\/finance\/requests\/[^/]+\/(approve|reject)$/.test(s.path) && !!s.body.reason);
  async function load() {
    const current = ++generation.current; setLoading(true); setError('');
    try { const next = await api<ListResponse<CorrectionRequest>>(`/finance/requests?page=${page}&limit=25${status ? `&status=${status}` : ''}`); if (current === generation.current) setData(next); }
    catch (e) { if (current === generation.current) setError(messageOf(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); }, [page, status]);
  async function decide(event: FormEvent) {
    event.preventDefault(); setNotice('');
    const result = await recovery.send<CorrectionRequest>(selected ? `/finance/requests/${selected.id}/${decision}` : undefined, { reason: reason.trim() });
    if (result) {
      setSelected(result); setNotice(`Server decision: ${result.status}${result.decisionReason ? ` · ${result.decisionReason}` : ''}`);
      window.dispatchEvent(new Event('finance-requests-changed'));
    }
    // STALE can be returned as a conflict; always re-read the authoritative state.
    await load();
    if (selected && !result) {
      const rows = await allItems<CorrectionRequest>('/finance/requests').catch(() => null);
      const updated = rows?.find(r => r.id === selected.id); if (updated) setSelected(updated);
    }
  }
  return <>
    <PageHeader title="Correction approval inbox" description="Requests freeze the proposed correction. Only a server APPLIED decision confirms a financial change." action={<button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh inbox</button>} />
    {(error || recovery.error) && <div className="notice error" role="alert">{error || recovery.error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel"><label htmlFor="request-status">Request status</label><select id="request-status" className="select" value={status} disabled={recovery.frozen || loading} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['REQUESTED', 'APPLIED', 'REJECTED', 'STALE'].map(s => <option key={s}>{s}</option>)}</select>
      {data && <p>{data.total} matching requests · Page {data.page}</p>}
      {data?.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Request / payment</th><th>Correction</th><th>Reason / reference</th><th>Status</th><th /></tr></thead><tbody>{data.items.map(r => <tr key={r.id}><td>{r.id}<small>{r.paymentId}</small><small>{new Date(r.createdAt).toLocaleString('en-IN')} · {r.requestedBy}</small></td><td>{r.type}<small>{r.amountMinor === null ? 'Exact frozen correction' : rupees(r.amountMinor)}</small></td><td>{r.reason}<small>{r.reference}</small></td><td><StatusBadge status={r.status} /><small>{r.decisionReason}</small></td><td><button className="button small secondary" disabled={recovery.frozen} onClick={() => { setSelected(r); setReason(''); }}>Review request</button></td></tr>)}</tbody></table></div> : <EmptyState title={loading ? 'Loading requests…' : 'No matching requests'} detail="Accountants can create requests from the receipt register." />}
      <div className="form-actions"><button className="button secondary" disabled={loading || recovery.frozen || page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="button secondary" disabled={loading || recovery.frozen || !data || page * data.limit >= data.total} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </section>
    {(selected || recovery.pending) && <section className="panel section-panel"><h2>Review correction</h2>{selected && <><p>Request {selected.id} · Payment {selected.paymentId} · <a className="text-link" href={`/receipts?paymentId=${encodeURIComponent(selected.paymentId)}`}>Inspect payment receipt</a></p><p>{selected.type} · {selected.amountMinor ? rupees(selected.amountMinor) : 'Frozen correction'} · {selected.reason} · {selected.reference}</p><p>Business date {selected.businessDate?.slice(0, 10) ?? 'Server default'} · Shift {selected.shiftId ?? 'None'}</p><StatusBadge status={selected.status} /><p>{selected.decisionReason}</p>{selected.status === 'STALE' && <p>The financial state changed. Create a fresh request from the receipt after reviewing current balances and policy.</p>}</>}
      {admin && (selected?.status === 'REQUESTED' || recovery.pending) && <form onSubmit={decide}>{recovery.pending ? <p>Unconfirmed decision: {recovery.pending.path} · {recovery.pending.body.reason}. Retry the frozen decision.</p> : <fieldset disabled={recovery.busy}><div className="form-field"><label htmlFor="decision">Decision</label><select id="decision" className="select" value={decision} onChange={e => setDecision(e.target.value)}><option value="approve">Approve exact correction</option><option value="reject">Reject request</option></select></div><div className="form-field"><label htmlFor="decision-reason">Decision reason</label><textarea className="textarea" id="decision-reason" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} /></div></fieldset>}<button className="button" disabled={recovery.busy || !recovery.ready}>{recovery.pending ? 'Retry decision' : 'Submit decision'}</button></form>}
    </section>}
  </>;
}
