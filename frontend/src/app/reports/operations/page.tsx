'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/AppShell';
import { api, StoreIssue, StoreProduct, rupees } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type StockReceipt = { id: string; receiptNumber: string; receivedAt: string; totalMinor: string; vendorName: string; reason: string };
type StoreReport = { denominator: string; total: number; lowStock: number; items: StoreProduct[]; movementSummary: Record<string, number>; movementCount: number; page: number; limit: number; asOf?: string | null; fromDate?: string | null; toDate?: string | null };
type ReportTab = 'inventory' | 'issues' | 'receipts';

export default function OperationsReportsPage() {
  const [tab, setTab] = useState<ReportTab>('inventory');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<StoreReport | null>(null);
  const [issues, setIssues] = useState<StoreIssue[]>([]);
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryData, issueData, receiptData] = await Promise.all([
        api<StoreReport>(`/reports/store?month=${encodeURIComponent(month)}&limit=100&page=1`),
        api<{ items: StoreIssue[] }>('/store/defaulters?limit=100&page=1'),
        api<{ items: StockReceipt[] }>('/store/stock-receipts?limit=100&page=1'),
      ]);
      setReport(summaryData);
      setIssues(issueData.items);
      setReceipts(receiptData.items);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const monthIssues = useMemo(() => issues.filter(item => item.issuedAt.slice(0, 7) === month), [issues, month]);
  const monthReceipts = useMemo(() => receipts.filter(item => item.receivedAt.slice(0, 7) === month), [receipts, month]);
  const products = report?.items ?? [];
  const lowStock = products.filter(item => item.quantity <= item.alertQuantity);
  const periodOutstanding = monthIssues.reduce((total, item) => total + BigInt(item.outstandingMinor), BigInt(0)).toString();

  return <AppShell>
    <PageHeader eyebrow="Reports" title="Store operational reports" description="Review stock levels, open student issues, and inventory receipts in one readable report workspace. Student payment receipts remain in Receipts." action={<button className="button secondary" onClick={() => window.print()}>Print report</button>} />
    {error && <div className="notice error workspace-error" role="alert"><span>{error}</span><button className="button secondary small" onClick={() => void load()}>Retry</button></div>}
    <section className="panel report-toolbar">
      <div className="workspace-filters"><div className="form-field"><label htmlFor="store-report-month">Report month</label><input className="input" id="store-report-month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div><div className="form-field"><label>Report scope</label><div className="readonly-value">Store operations · {month}</div></div><button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh report</button></div>
    </section>
    {loading ? <div className="panel section-panel loading-state"><div className="spinner" /> Loading store reports…</div> : report ? <>
      <div className="stats-grid section-panel"><StatCard label="Products" value={report.total} detail="Store products in report" tone="blue" /><StatCard label="Low stock" value={report.lowStock} detail="At or below alert level" tone="amber" /><StatCard label="Stock movements" value={report.movementCount} detail={`Recorded during ${month}`} tone="purple" /><StatCard label="Period outstanding" value={rupees(periodOutstanding)} detail={`${monthIssues.length} issue(s) in ${month}`} tone="green" /></div>
      <div className="button-group section-panel report-tabs">{([['inventory', 'Inventory'], ['issues', 'Student issues'], ['receipts', 'Stock receipts']] as const).map(([value, label]) => <button className={`button ${tab === value ? '' : 'secondary'}`} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
      {tab === 'inventory' && <section className="panel section-panel"><div className="panel-header"><div><h2>Inventory and low stock</h2><span>Current quantity and movement totals are from the server report for {month}.</span></div></div>{products.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Group</th><th>Quantity</th><th>Alert at</th><th>Unit cost</th><th>Stock state</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.description || 'No description'}</small></td><td>{product.groupName || '—'}</td><td><strong className={product.quantity <= product.alertQuantity ? 'danger-text' : ''}>{product.quantity}</strong></td><td>{product.alertQuantity}</td><td>{rupees(product.unitCostMinor)}</td><td><StatusBadge status={product.quantity <= product.alertQuantity ? 'LOW_STOCK' : 'IN_STOCK'} /></td></tr>)}</tbody></table></div> : <EmptyState title="No products" detail="Create store products before reviewing inventory." />}{lowStock.length > 0 && <div className="notice">{lowStock.length} product(s) need replenishment at the current alert level. Movement totals: {Object.entries(report.movementSummary).map(([type, count]) => `${type} ${count}`).join(' · ') || 'none'}.</div>}</section>}
      {tab === 'issues' && <section className="panel section-panel"><div className="panel-header"><div><h2>Student store issues and defaulters</h2><span>Open balances issued during {month}. Use Collect payment for settlement.</span></div></div>{monthIssues.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Issue</th><th>Student</th><th>Issued</th><th>Total</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{monthIssues.map(issue => <tr key={issue.id}><td><strong>{issue.issueNumber}</strong></td><td><a className="text-link" href={`/students/${issue.studentId}`}>{issue.admissionNumber}</a><small>{issue.studentName}</small></td><td>{issue.issuedAt.slice(0, 10)}</td><td>{rupees(issue.totalMinor)}</td><td>{rupees(issue.outstandingMinor)}</td><td><StatusBadge status={issue.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No open issues this month" detail="Open student store balances issued in the selected month will appear here." />}</section>}
      {tab === 'receipts' && <section className="panel section-panel"><div className="panel-header"><div><h2>Stock receipts</h2><span>Inventory receipts increase stock; they are not student payment receipts.</span></div></div>{monthReceipts.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Receipt</th><th>Date</th><th>Vendor</th><th>Total</th><th>Reason</th></tr></thead><tbody>{monthReceipts.map(receipt => <tr key={receipt.id}><td className="primary-text">{receipt.receiptNumber}</td><td>{receipt.receivedAt.slice(0, 10)}</td><td>{receipt.vendorName}</td><td>{rupees(receipt.totalMinor)}</td><td>{receipt.reason}</td></tr>)}</tbody></table></div> : <EmptyState title="No stock receipts this month" detail="Stock receipts recorded for the selected month will appear here." />}</section>}
    </> : <section className="panel section-panel"><EmptyState title="Store report is unavailable" detail="Refresh the report when the store API is available. No zero totals are shown for a failed load." /></section>}
  </AppShell>;
}
