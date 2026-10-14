import { rupees } from '@/lib/api';
import { fieldLabel } from '@/lib/reports';

export function ReportTotals({ totals }: { totals: Record<string, string | number | boolean> }) {
  return <div className="money-summary" aria-label="Full filtered totals">{Object.entries(totals).map(([key, value]) => <div key={key}><span>{fieldLabel(key)}</span><strong>{key.endsWith('Minor') && typeof value === 'string' ? rupees(value) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</strong></div>)}</div>;
}
