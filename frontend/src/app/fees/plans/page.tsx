'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, AcademicSession, ClassOffering, FeeHead, FeePlan, FeePlanVersion, FeeRule, rupees, toPaise, User } from '@/lib/api';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';

type RuleForm = { feeHeadId: string; classId: string; frequency: string; amount: string; assessmentMonth: string; entryType: string; category: string; dueDay: string };
const emptyRule = (): RuleForm => ({ feeHeadId: '', classId: '', frequency: 'MONTHLY', amount: '', assessmentMonth: '', entryType: 'ALL', category: 'ALL', dueDay: '10' });

export default function FeePlansPage() {
  const [actor, setActor] = useState<User | null>(null);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<ClassOffering[]>([]);
  const [heads, setHeads] = useState<FeeHead[]>([]);
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [form, setForm] = useState({ sessionId: '', name: '', effectiveFrom: '', effectiveTo: '' });
  const [rules, setRules] = useState<RuleForm[]>([emptyRule()]);
  const [headForm, setHeadForm] = useState({ code: '', name: '', category: 'MONTHLY' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revisionId, setRevisionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<(FeePlan & { versions: (FeePlanVersion & { rules: FeeRule[] })[] }) | null>(null);

  const load = async () => {
    try {
      const [sessionData, classData, headData, planData] = await Promise.all([
        api<AcademicSession[]>('/school/sessions'),
        api<{ items: ClassOffering[] }>('/school/classes?limit=100'),
        api<FeeHead[]>('/fee-heads'),
        api<FeePlan[]>('/fee-plans?limit=100'),
      ]);
      setSessions(sessionData); setClasses(classData.items); setHeads(headData); setPlans(planData);
      if (!form.sessionId && sessionData[0]) {
        const selected = sessionData.find(item => item.current) ?? sessionData[0];
        setForm(current => ({ ...current, sessionId: selected.id, effectiveFrom: selected.startDate.slice(0, 10) }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load fee plans'); }
  };

  useEffect(() => { api<{ user: User }>('/auth/me').then(result => setActor(result.user)).catch(e => setError(e.message)); void load(); }, []);
  const admin = actor?.role === 'ADMIN' || actor?.role === 'SUPERADMIN';

  async function createHead(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await api('/fee-heads', { method: 'POST', body: JSON.stringify(headForm) }); setNotice('Fee head created.'); setHeadForm({ code: '', name: '', category: 'MONTHLY' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create fee head'); }
    finally { setBusy(false); }
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      if (!form.sessionId || !form.name.trim() || !form.effectiveFrom) throw new Error('Complete the plan identity and effective date');
      if (!rules.every(rule => rule.feeHeadId && rule.amount && rule.dueDay)) throw new Error('Complete every fee rule');
      const payload = rules.map(rule => ({
        feeHeadId: rule.feeHeadId, classId: rule.classId || undefined, frequency: rule.frequency, amountMinor: toPaise(rule.amount),
        assessmentMonth: rule.assessmentMonth ? Number(rule.assessmentMonth) : undefined, entryType: rule.entryType, category: rule.category, dueDay: Number(rule.dueDay),
      }));
      await api(revisionId ? `/fee-plans/${revisionId}/versions` : '/fee-plans', { method: 'POST', body: JSON.stringify({ ...form, effectiveTo: form.effectiveTo || undefined, rules: payload }) });
      setNotice('Fee plan saved as a draft.'); setRevisionId(''); setDetail(null); setForm(current => ({ ...current, name: '', effectiveTo: '' })); setRules([emptyRule()]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create fee plan'); }
    finally { setBusy(false); }
  }

  async function publish(plan: FeePlan, versionNumber: number) {
    if (busy) return;
    const reason = window.prompt(`Publish ${plan.name} version ${versionNumber}`); if (!reason) return;
    setBusy(true); setError(''); setNotice('');
    try { await api(`/fee-plans/${plan.id}/publish`, { method: 'POST', body: JSON.stringify({ versionNumber, reason }) }); setNotice('Fee plan published.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to publish fee plan'); }
    finally { setBusy(false); }
  }

  async function inspect(plan: FeePlan, revise = false) {
    try {
      const result = await api<NonNullable<typeof detail>>(`/fee-plans/${plan.id}`);
      setDetail(result);
      if (revise) {
        const latest = result.versions[0];
        setRevisionId(plan.id); setForm({ sessionId: plan.sessionId, name: plan.name, effectiveFrom: '', effectiveTo: '' });
        setRules(latest.rules.map(rule => ({ feeHeadId: rule.feeHeadId, classId: rule.classId ?? '', frequency: rule.frequency, amount: `${BigInt(rule.amountMinor) / BigInt(100)}.${String(BigInt(rule.amountMinor) % BigInt(100)).padStart(2, '0')}`, assessmentMonth: rule.assessmentMonth ? String(rule.assessmentMonth) : '', entryType: rule.entryType ?? 'ALL', category: rule.category ?? 'ALL', dueDay: String(rule.dueDay ?? 10) })));
        document.getElementById('plan-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load plan rules'); }
  }

  return <AppShell>
    <PageHeader eyebrow="Fees & Payments" title="Fee plans" description="Admins publish versioned fee rules. Accountants can inspect published plans and preview student obligations." />
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
    <div className="split-grid">
      <section className="panel">
        <div className="panel-header"><div><h2>Fee heads</h2><span>Stable codes prevent duplicate-looking charges</span></div></div>
        {admin && <form className="compact-form" onSubmit={createHead}><div className="form-grid">
          <div className="form-field"><label htmlFor="head-code">Code</label><input className="input" id="head-code" placeholder="TUITION" value={headForm.code} onChange={e => setHeadForm({ ...headForm, code: e.target.value.toUpperCase() })} required /></div>
          <div className="form-field"><label htmlFor="head-name">Name</label><input className="input" id="head-name" placeholder="Tuition Fee" value={headForm.name} onChange={e => setHeadForm({ ...headForm, name: e.target.value })} required /></div>
          <div className="form-field"><label htmlFor="head-category">Category</label><select className="select" id="head-category" value={headForm.category} onChange={e => setHeadForm({ ...headForm, category: e.target.value })}><option>MONTHLY</option><option>ANNUAL</option><option>HALF_YEARLY</option><option>NEW_ADMISSION</option><option>SERVICE</option><option>MISC</option></select></div>
        </div><div className="form-actions"><button className="button secondary" disabled={busy}>Add fee head</button></div></form>}
        {heads.length ? <div className="tag-list">{heads.map(head => <span className="data-tag" key={head.id}><strong>{head.code}</strong> {head.name}</span>)}</div> : <EmptyState title="No fee heads" detail="Add the first charge head to begin a plan." />}
      </section>
      <section className="panel"><div className="panel-header"><div><h2>Publishing rules</h2><span>Admin/Superadmin only</span></div></div><div className="permission-list"><div><strong>Draft</strong><span>Review affected classes and periods before publishing.</span></div><div><strong>Published</strong><span>Used by assessment; later changes are versioned.</span></div><div><strong>Accountant</strong><span>Can inspect plans and preview charges, but cannot change rules.</span></div></div></section>
    </div>
    {admin && <section className="panel section-panel"><div className="panel-header"><div><h2>{revisionId ? 'Create new version' : 'Create fee plan'}</h2><span>Amounts are entered in rupees and stored as integer paise.</span></div>{revisionId && <button className="button secondary" onClick={() => { setRevisionId(''); setRules([emptyRule()]); setForm(current => ({ ...current, name: '' })); }}>Cancel revision</button>}</div>
      <form onSubmit={createPlan}><div className="form-grid">
        <div className="form-field"><label htmlFor="plan-session">Academic session</label><select className="select" id="plan-session" value={form.sessionId} disabled={!!revisionId} onChange={e => { setForm({ ...form, sessionId: e.target.value }); setRules(rules.map(rule => ({ ...rule, classId: '' }))); }} required><option value="">Select session</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}</select></div>
        <div className="form-field"><label htmlFor="plan-name">Plan name</label><input className="input" id="plan-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="2026–27 standard plan" required /></div>
        <div className="form-field"><label htmlFor="plan-from">Effective from</label><input className="input" id="plan-from" type="date" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} required /></div>
        <div className="form-field"><label htmlFor="plan-to">Effective to <span className="field-hint">optional</span></label><input className="input" id="plan-to" type="date" value={form.effectiveTo} onChange={e => setForm({ ...form, effectiveTo: e.target.value })} /></div>
      </div>
      <div className="rule-editor"><div className="panel-header"><div><h3>Rules</h3><span>Use a class to override the school-wide rule for that fee head.</span></div><button type="button" className="button secondary" onClick={() => setRules([...rules, emptyRule()])}>Add rule</button></div>
        {rules.map((rule, index) => <div className="rule-row" key={index}><div className="form-field"><label>Fee head</label><select className="select" value={rule.feeHeadId} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, feeHeadId: e.target.value } : item))} required><option value="">Select head</option>{heads.map(head => <option key={head.id} value={head.id}>{head.code} · {head.name}</option>)}</select></div><div className="form-field"><label>Class <span className="field-hint">all if blank</span></label><select className="select" value={rule.classId} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, classId: e.target.value } : item))}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.grade} – {item.section}{item.stream ? ` · ${item.stream}` : ''}</option>)}</select></div><div className="form-field"><label>Frequency</label><select className="select" value={rule.frequency} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, frequency: e.target.value, assessmentMonth: e.target.value === 'MONTHLY' || e.target.value === 'ONE_TIME' ? '' : item.assessmentMonth } : item))}><option>MONTHLY</option><option>ANNUAL</option><option>HALF_YEARLY</option><option>ONE_TIME</option></select></div><div className="form-field"><label>Amount ₹</label><input className="input" type="number" min="0.01" step="0.01" value={rule.amount} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, amount: e.target.value } : item))} required /></div><div className="form-field"><label>Due day</label><input className="input" type="number" min="1" max="31" value={rule.dueDay} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, dueDay: e.target.value } : item))} required /></div>{rule.frequency !== 'MONTHLY' && rule.frequency !== 'ONE_TIME' && <div className="form-field"><label>Assessment month</label><input className="input" type="number" min="1" max="12" placeholder="1–12" value={rule.assessmentMonth} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, assessmentMonth: e.target.value } : item))} required /></div>}<div className="form-field"><label>Entry</label><select className="select" value={rule.entryType} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, entryType: e.target.value } : item))}><option>ALL</option><option>NEW_ADMISSION</option><option>CONTINUING</option><option>PROMOTED</option><option>READMISSION</option></select></div><div className="form-field"><label>Category</label><select className="select" value={rule.category} onChange={e => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, category: e.target.value } : item))}><option>ALL</option><option>GENERAL</option><option>EWS</option><option>STAFF_CHILD</option><option>SIBLING</option></select></div>{rules.length > 1 && <button type="button" className="icon-button" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(rules.filter((_item, itemIndex) => itemIndex !== index))}>×</button>}</div>)}
      </div><div className="form-actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save draft plan'}</button></div></form>
    </section>}
    <section className="panel section-panel"><div className="panel-header"><div><h2>Plans</h2><span>{plans.length} configured plan{plans.length === 1 ? '' : 's'}</span></div></div>{plans.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Plan</th><th>Session</th><th>Status</th><th>Versions</th><th>Action</th></tr></thead><tbody>{plans.map(plan => <tr key={plan.id}><td><strong>{plan.name}</strong></td><td>{sessions.find(session => session.id === plan.sessionId)?.name ?? '—'}</td><td><StatusBadge status={plan.status} /></td><td>{plan.versions.map(version => <span className="table-chip" key={version.id}>v{version.versionNumber} · {version.status}</span>)}</td><td><button className="button secondary" onClick={() => void inspect(plan)}>View rules</button>{admin && <button className="button secondary" onClick={() => void inspect(plan, true)}>New version</button>}{admin && plan.versions.filter(version => version.status === 'DRAFT').map(version => <button className="button small" disabled={busy} key={version.id} onClick={() => void publish(plan, version.versionNumber)}>Publish v{version.versionNumber}</button>)}</td></tr>)}</tbody></table></div> : <EmptyState title="No plans yet" detail="Create a draft plan after defining fee heads." />}</section>
    {detail && <section className="panel section-panel"><h2>{detail.name} rules</h2>{detail.versions.map(version => <div key={version.id}><h3>Version {version.versionNumber} · {version.status} · from {version.effectiveFrom.slice(0, 10)}</h3><div className="data-table-wrap"><table><thead><tr><th>Head</th><th>Class</th><th>Frequency</th><th>Amount</th><th>Month</th><th>Entry / category</th><th>Due day</th></tr></thead><tbody>{(version.rules ?? []).map((rule, index) => <tr key={rule.id ?? index}><td>{heads.find(head => head.id === rule.feeHeadId)?.name}</td><td>{rule.classId ? classes.find(item => item.id === rule.classId)?.grade : 'All'}</td><td>{rule.frequency}</td><td>{rupees(rule.amountMinor)}</td><td>{rule.assessmentMonth ?? '—'}</td><td>{rule.entryType} / {rule.category}</td><td>{rule.dueDay}</td></tr>)}</tbody></table></div></div>)}</section>}
  </AppShell>;
}
