'use client';

import { FormEvent, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';
import { api, ImportResult } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type ImportKind = 'students' | 'transport' | 'store';
type ImportResource = { label: string; path: string };
type ImportCard = { kind: ImportKind; title: string; description: string; resources: ImportResource[]; fields: string; example: string };

const cards: ImportCard[] = [
  { kind: 'students', title: 'Student registry', description: 'Import student identity, admission number, guardian, and enrollment references from an authorized export.', resources: [{ label: 'Students and enrollments', path: '/imports/students' }], fields: 'admissionNumber, name, dateOfBirth, gender, admissionDate, sessionId, classId, guardianName, guardianPhone', example: 'students-export.csv' },
  { kind: 'transport', title: 'Transport data', description: 'Import route masters, vehicle masters, or dated student allocations in the order they are needed.', resources: [{ label: 'Routes', path: '/imports/transport/routes' }, { label: 'Vehicles', path: '/imports/transport/vehicles' }, { label: 'Student allocations', path: '/imports/transport/allocations' }], fields: 'Routes: name, campus, destination, monthlyAmount, capacity · allocations: admissionNumber, routeName, busNumber, startDate, endDate', example: 'transport-export.csv' },
  { kind: 'store', title: 'Store data', description: 'Import products, vendors, or opening stock. Historical student issue balances remain subject to a reviewed source mapping.', resources: [{ label: 'Products', path: '/imports/store/products' }, { label: 'Vendors', path: '/imports/store/vendors' }, { label: 'Opening stock', path: '/imports/store/stock-opening' }], fields: 'Products: name, unitCost, alertQuantity · vendors: name, phone, email · stock: productName, quantity, unitCost, receivedAt', example: 'store-export.csv' },
];

export default function ImportsPage() {
  const [files, setFiles] = useState<Partial<Record<ImportKind, File>>>({});
  const [resources, setResources] = useState<Partial<Record<ImportKind, string>>>({ students: '/imports/students', transport: '/imports/transport/routes', store: '/imports/store/products' });
  const [sources, setSources] = useState<Partial<Record<ImportKind, string>>>({});
  const [reasons, setReasons] = useState<Partial<Record<ImportKind, string>>>({});
  const [dryRun, setDryRun] = useState<Partial<Record<ImportKind, boolean>>>({ students: true, transport: true, store: true });
  const [results, setResults] = useState<Partial<Record<ImportKind, ImportResult>>>({});
  const [busy, setBusy] = useState<ImportKind | null>(null);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>, card: ImportCard) {
    event.preventDefault();
    const file = files[card.kind];
    if (!file) {
      setError(`Choose a CSV file for ${card.title}.`);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Imports currently accept CSV exports only. Save the spreadsheet as CSV and try again.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The selected CSV is larger than 5 MB. Split the export into smaller files.');
      return;
    }
    if ((reasons[card.kind] ?? '').trim().length < 3) {
      setError('Enter an import reason so the batch has an audit note.');
      return;
    }
    setBusy(card.kind);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('sourceName', sources[card.kind]?.trim() || 'authorized-school-export');
      form.set('reason', reasons[card.kind]!.trim());
      form.set('dryRun', String(dryRun[card.kind] !== false));
      const result = await api<ImportResult>(resources[card.kind] || card.resources[0].path, { method: 'POST', body: form });
      setResults(current => ({ ...current, [card.kind]: result }));
      const rejected = result.rejected ?? result.summary?.invalidRows ?? 0;
      if (rejected > 0) setError(`${card.title} finished with rejected rows. Review the row errors before executing a committed import.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  return <AppShell>
    <PageHeader eyebrow="Administration" title="Import school data" description="Upload one authorized CSV at a time, run a dry check first, and review duplicates and row errors before committing any data." />
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="notice"><strong>Safe import order:</strong> student identities → transport masters and allocations → store opening data. A dry run must be reviewed before an import is committed.</div>
    <div className="import-grid">
      {cards.map(card => <section className="panel import-card" key={card.kind}>
        <div className="panel-header"><div><h2>{card.title}</h2><span>{card.description}</span></div><span className="data-tag">CSV</span></div>
        <form onSubmit={event => void submit(event, card)}>
          <div className="form-field"><label htmlFor={`${card.kind}-resource`}>Data type</label><select className="select" id={`${card.kind}-resource`} value={resources[card.kind] ?? card.resources[0].path} onChange={event => setResources(current => ({ ...current, [card.kind]: event.target.value }))} disabled={busy !== null}>{card.resources.map(resource => <option key={resource.path} value={resource.path}>{resource.label}</option>)}</select></div>
          <div className="form-field"><label htmlFor={`${card.kind}-file`}>CSV export</label><input className="input" id={`${card.kind}-file`} type="file" accept=".csv,text/csv" onChange={event => setFiles(current => ({ ...current, [card.kind]: event.target.files?.[0] }))} disabled={busy !== null} required /><small className="field-hint">Example: {card.example} · maximum 5 MB</small></div>
          <div className="form-field"><label htmlFor={`${card.kind}-source`}>Source / version</label><input className="input" id={`${card.kind}-source`} value={sources[card.kind] ?? ''} onChange={event => setSources(current => ({ ...current, [card.kind]: event.target.value }))} placeholder="Legacy export · October 2026" disabled={busy !== null} /></div>
          <div className="form-field"><label htmlFor={`${card.kind}-reason`}>Import reason</label><input className="input" id={`${card.kind}-reason`} value={reasons[card.kind] ?? ''} onChange={event => setReasons(current => ({ ...current, [card.kind]: event.target.value }))} placeholder="Opening migration from approved export" minLength={3} maxLength={500} disabled={busy !== null} required /></div>
          <div className="detail-item import-fields"><label>Expected fields</label><strong>{card.fields}</strong></div>
          <label className="check-field"><input type="checkbox" checked={dryRun[card.kind] !== false} onChange={event => setDryRun(current => ({ ...current, [card.kind]: event.target.checked }))} disabled={busy !== null} /> Dry run only — do not write records</label>
          <div className="form-actions"><button className="button" disabled={busy !== null}>{busy === card.kind ? 'Checking file…' : dryRun[card.kind] !== false ? 'Validate CSV' : 'Import approved CSV'}</button></div>
        </form>
        {results[card.kind] ? <ImportResultPanel result={results[card.kind]!} /> : <EmptyState title="No import run yet" detail="Choose a file and validate it to see row counts and exceptions." />}
      </section>)}
    </div>
  </AppShell>;
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  const imported = result.imported ?? result.summary?.importedRows ?? 0;
  const skipped = result.skipped ?? Math.max(0, (result.summary?.totalRows ?? 0) - (result.summary?.validRows ?? 0));
  const rejected = result.rejected ?? result.summary?.invalidRows ?? 0;
  const errors: { row?: number; field?: string; message: string }[] = result.errors ?? (result.rows ?? []).filter(row => row.error).map(row => ({ row: row.rowNumber, message: row.error! }));
  return <div className="import-result" aria-live="polite">
    <div className="panel-header"><h3>Latest result</h3><StatusBadge status={result.status || result.batch?.status || (rejected ? 'REVIEW' : 'PREVIEWED')} /></div>
    <div className="money-summary"><div><span>Imported</span><strong>{imported}</strong></div><div><span>Skipped</span><strong>{skipped}</strong></div><div><span>Rejected</span><strong>{rejected}</strong></div></div>
    {result.controlTotal && <p className="muted">Control total: {result.controlTotal.source || 'source'} · difference {result.controlTotal.difference || '0'}</p>}
    {errors.length ? <div className="import-errors"><strong>Review row errors</strong>{errors.slice(0, 5).map((item, index) => <p key={`${item.row}-${index}`}>Row {item.row ?? '—'}{item.field ? ` · ${item.field}` : ''}: {item.message}</p>)}{errors.length > 5 && <small>{errors.length - 5} more error(s) returned by the server.</small>}</div> : <p className="notice success">No row errors returned. Review the control totals before committing.</p>}
  </div>;
}
