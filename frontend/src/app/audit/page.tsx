'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell, EmptyState, PageHeader } from '@/components/AppShell';

type Event = { id: string; actorId: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string };
export default function AuditPage() { const [items, setItems] = useState<Event[]>([]); const [error, setError] = useState(''); useEffect(() => { api<{ items: Event[] }>('/audit?limit=100').then(result => setItems(result.items)).catch(e => setError(e instanceof Error ? e.message : 'Unable to load audit history')); }, []); return <AppShell><PageHeader eyebrow="Administration" title="Audit history" description="Every account, classroom, application, enrollment, and permission-sensitive change is recorded with an actor and reason." />{error && <div className="notice error">{error}</div>}<section className="panel"><div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td className="muted">{new Date(item.createdAt).toLocaleString('en-IN')}</td><td className="primary-text">{item.action}</td><td>{item.entityType}<small className="muted">{item.entityId}</small></td><td>{item.actorId}</td><td>{item.reason}</td></tr>)}</tbody></table>{!items.length && <EmptyState title="No audit events yet" detail="Changes will appear here after staff actions are recorded." />}</div></section></AppShell>; }
