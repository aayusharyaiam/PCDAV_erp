'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, downloadReceiptPdf } from '@/lib/api';
import { PdfStatus } from '@/lib/finance';
import { messageOf } from '@/lib/payments';

export function ReceiptPdf({ receiptId, receiptNumber }: { receiptId: string; receiptNumber: string }) {
  const [status, setStatus] = useState<PdfStatus | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = `/receipts/${encodeURIComponent(receiptId)}/pdf`;
  async function refresh() { setError(''); try { setStatus(await api<PdfStatus>(`${path}/status`)); } catch (e) { setStatus(null); setError(messageOf(e)); } }
  useEffect(() => {
    let active = true;
    const check = () => api<PdfStatus>(`${path}/status`).then(r => { if (active) { setStatus(r); setError(''); } }).catch(e => { if (active) { setStatus(null); setError(messageOf(e)); } });
    void check(); const timer = window.setInterval(() => void check(), 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [path]);
  async function retry(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice(''); setStatus(null);
    try { await api(`${path}/retry`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }); setNotice('PDF retry accepted. Waiting for server job status.'); await refresh(); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try { await downloadReceiptPdf(receiptId, receiptNumber); }
    catch (e) { setStatus(null); setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  return <div className="pdf-panel" aria-label="Receipt PDF"><h3>Receipt PDF</h3><p>{status ? `${status.status} · ${status.attempts} attempts${status.errorCode ? ` · ${status.errorCode}` : ''}` : 'PDF status not confirmed'}</p><p>The download uses the immutable snapshot with current receipt status. A pending or failed PDF does not undo the payment.</p>
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void refresh()}>Refresh PDF status</button><button type="button" className="button" disabled={busy || !status?.downloadAvailable} onClick={() => void download()}>Download receipt PDF</button></div>
    {!status?.downloadAvailable && <form onSubmit={retry}><div className="form-field"><label htmlFor="pdf-reason">PDF retry reason</label><input className="input" id="pdf-reason" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} /></div><button className="button secondary" disabled={busy}>Retry PDF generation</button></form>}
  </div>;
}
