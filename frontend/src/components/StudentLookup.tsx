'use client';

import { FormEvent, useState } from 'react';
import { api, Student } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type Props = {
  selected: Student | null;
  onSelect: (student: Student) => void;
  onClear: () => void;
  disabled?: boolean;
  includeFormer?: boolean;
};

export function StudentLookup({ selected, onSelect, onClear, disabled = false, includeFormer = true }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || disabled) return;
    setBusy(true);
    setError('');
    try {
      const status = includeFormer ? '' : '&status=ACTIVE';
      const result = await api<{ items: Student[] }>(`/students?limit=25${status}&q=${encodeURIComponent(query.trim())}`);
      setItems(result.items);
      if (!result.items.length) setError('No students match that search. Try the admission number.');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return <div className="selected-student-card">
      <div><span className="eyebrow">Selected student</span><strong>{selected.name}</strong><small>{selected.admissionNumber} · {selected.className || 'Class not assigned'} · {selected.status}</small></div>
      <button className="button secondary small" type="button" onClick={onClear} disabled={disabled}>Change student</button>
    </div>;
  }

  return <div>
    <form className="search-row" onSubmit={search}>
      <label className="sr-only" htmlFor="workflow-student-search">Student search</label>
      <input className="input" id="workflow-student-search" placeholder="Admission number, student name, or guardian phone" value={query} onChange={event => setQuery(event.target.value)} disabled={disabled || busy} />
      <button className="button secondary" disabled={disabled || busy || !query.trim()}>{busy ? 'Searching…' : 'Find student'}</button>
    </form>
    {error && <div className="notice error" role="alert">{error}</div>}
    {items.length > 0 && <div className="lookup-results" role="listbox" aria-label="Student search results">{items.map(student => <button type="button" key={student.id} onClick={() => { setItems([]); setError(''); onSelect(student); }}><strong>{student.admissionNumber}</strong><span>{student.name} · {student.className || 'Class not assigned'} · {student.status}</span></button>)}</div>}
  </div>;
}
