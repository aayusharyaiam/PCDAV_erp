import { AllocationSummary, PaymentQuoteLine, rupees } from '@/lib/api';

export function PaymentAllocation({ lines, summary }: { lines: PaymentQuoteLine[]; summary: AllocationSummary }) {
  return <>
    {lines.length > 0 && <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Source / due date</th><th>Before</th><th>Credit applied</th><th>Payment allocated</th><th>After</th></tr></thead>
      <tbody>{lines.map(line => <tr key={`${line.targetType}-${line.targetId}`}>
        <td><strong>{line.description}</strong><small>{line.targetType} · {line.reference} · {line.dueDate}</small></td>
        <td>{rupees(line.beforeOutstandingMinor)}</td><td>{rupees(line.creditAppliedMinor)}</td>
        <td>{rupees(line.paymentAllocatedMinor)}</td><td>{rupees(line.afterOutstandingMinor)}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="money-summary">
      <div><span>Credit applied</span><strong>{rupees(summary.creditAppliedMinor)}</strong></div>
      <div><span>Payment allocated</span><strong>{rupees(summary.paymentAllocatedMinor)}</strong></div>
      <div><span>Remaining due</span><strong>{rupees(summary.projectedOutstandingMinor)}</strong></div>
      <div><span>Credit after posting</span><strong>{rupees(summary.projectedCreditMinor)}</strong></div>
    </div>
  </>;
}
