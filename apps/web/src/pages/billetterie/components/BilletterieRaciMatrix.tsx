import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface StaffMember { id: string; name: string; role: string }

interface RaciRow {
  id: string;
  area: string;
  responsibleId: string | null;
  accountableId: string | null;
  consulted: string[];
  informed: string[];
  phaseKey: string | null;
  notes: string | null;
  responsible: StaffMember | null;
  accountable: StaffMember | null;
  consultedMembers: StaffMember[];
  informedMembers: StaffMember[];
}

const PHASE_LABELS: Record<string, string> = {
  INITIATION: 'Initiation', ELICITATION: 'Elicitation', ARCHITECTURE: 'Architecture',
  DEVELOPMENT: 'Development', TESTING: 'Testing', SIGN_OFF: 'Sign-off', CLOSURE: 'Closure',
};

const PHASES = ['INITIATION', 'ELICITATION', 'ARCHITECTURE', 'DEVELOPMENT', 'TESTING', 'SIGN_OFF', 'CLOSURE'];

function StaffPicker({ value, onChange, staff, placeholder }: {
  value: string | null; onChange: (v: string | null) => void;
  staff: StaffMember[]; placeholder: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      <option value="">{placeholder}</option>
      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

function MultiStaffPicker({ value, onChange, staff }: {
  value: string[]; onChange: (v: string[]) => void; staff: StaffMember[];
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);

  return (
    <div className="flex flex-wrap gap-1">
      {staff.map(s => {
        const sel = value.includes(s.id);
        return (
          <button key={s.id} type="button" onClick={() => toggle(s.id)}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${sel ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {s.name.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}

function RaciCell({ label, color, members }: { label: string; color: string; members: StaffMember[] }) {
  if (!members.length) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {members.map(m => (
        <span key={m.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`} title={m.name}>
          {m.name.split(' ').map((w: string) => w[0]).join('')}
        </span>
      ))}
    </div>
  );
}

interface Props { projectId: string }

export function BilletterieRaciMatrix({ projectId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<{
    area: string; responsibleId: string | null; accountableId: string | null;
    consulted: string[]; informed: string[]; phaseKey: string | null; notes: string;
  }>>({});

  const { data: raciData, isLoading } = useQuery({
    queryKey: ['bil-raci', projectId],
    queryFn: () => api<{ data: RaciRow[] }>(`/billetterie/projects/${projectId}/raci`),
  });

  const { data: teamData } = useQuery({
    queryKey: ['bil-team-staff', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });

  const staff: StaffMember[] = (teamData?.data ?? []).map((m: any) => ({
    id: m.staffMemberId ?? m.id,
    name: m.name,
    role: m.memberRole ?? m.role ?? '',
  })).filter((m: any) => m.name);

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/raci`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-raci', projectId] }); setAdding(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api(`/billetterie/projects/${projectId}/raci/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-raci', projectId] }); setEditId(null); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/billetterie/projects/${projectId}/raci/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-raci', projectId] }),
  });

  function resetForm() {
    setForm({ consulted: [], informed: [], responsibleId: null, accountableId: null, phaseKey: null });
  }

  function startAdd() {
    resetForm();
    setAdding(true);
    setEditId(null);
  }

  function startEdit(row: RaciRow) {
    setForm({
      area: row.area, responsibleId: row.responsibleId, accountableId: row.accountableId,
      consulted: (row.consulted as string[]) ?? [], informed: (row.informed as string[]) ?? [],
      phaseKey: row.phaseKey, notes: row.notes ?? '',
    });
    setEditId(row.id);
    setAdding(false);
  }

  function saveRow() {
    if (!form.area?.trim()) return;
    const body = {
      area: form.area, responsibleId: form.responsibleId ?? null,
      accountableId: form.accountableId ?? null,
      consulted: form.consulted ?? [], informed: form.informed ?? [],
      phaseKey: form.phaseKey ?? null, notes: form.notes ?? null,
    };
    if (editId) updateMut.mutate({ id: editId, body });
    else createMut.mutate(body);
  }

  const rows: RaciRow[] = raciData?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">RACI Matrix</h2>
          <p className="text-xs text-gray-500 mt-0.5">Responsibility assignment per area — R (Responsible), A (Accountable), C (Consulted), I (Informed)</p>
        </div>
        <button onClick={startAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + Add Area
        </button>
      </div>

      {/* Add / edit form */}
      {(adding || editId) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">{editId ? 'Edit RACI Area' : 'New RACI Area'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Responsibility Area *</label>
              <input value={form.area ?? ''} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                placeholder="e.g. Requirements sign-off, Code review, UAT"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phase (optional)</label>
              <select value={form.phaseKey ?? ''} onChange={e => setForm(f => ({ ...f, phaseKey: e.target.value || null }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">All Phases</option>
                {PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional context..."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">R — Responsible (does the work)</label>
              <StaffPicker value={form.responsibleId ?? null} onChange={v => setForm(f => ({ ...f, responsibleId: v }))} staff={staff} placeholder="Select person" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">A — Accountable (owns outcome)</label>
              <StaffPicker value={form.accountableId ?? null} onChange={v => setForm(f => ({ ...f, accountableId: v }))} staff={staff} placeholder="Select person" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">C — Consulted (input before action)</label>
              <MultiStaffPicker value={form.consulted ?? []} onChange={v => setForm(f => ({ ...f, consulted: v }))} staff={staff} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">I — Informed (notified after)</label>
              <MultiStaffPicker value={form.informed ?? []} onChange={v => setForm(f => ({ ...f, informed: v }))} staff={staff} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveRow} disabled={!form.area?.trim() || createMut.isPending || updateMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {createMut.isPending || updateMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setAdding(false); setEditId(null); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading RACI matrix…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm font-medium text-gray-500">No RACI entries yet</p>
          <p className="text-xs text-gray-400 mt-1">Add responsibility areas to define who does what in this project</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-600 w-1/4">Area</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Phase</th>
                <th className="text-center px-3 py-2 font-semibold text-green-700 w-24">R</th>
                <th className="text-center px-3 py-2 font-semibold text-blue-700 w-24">A</th>
                <th className="text-left px-3 py-2 font-semibold text-amber-700">C</th>
                <th className="text-left px-3 py-2 font-semibold text-purple-700">I</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-3 py-2.5 font-medium text-gray-900">{row.area}</td>
                  <td className="px-3 py-2.5 text-gray-500">{row.phaseKey ? PHASE_LABELS[row.phaseKey] : <span className="text-gray-300">All</span>}</td>
                  <td className="px-3 py-2.5 text-center">
                    {row.responsible
                      ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-800 font-bold text-[10px]" title={row.responsible.name}>
                          {row.responsible.name.split(' ').map((w: string) => w[0]).join('')}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.accountable
                      ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]" title={row.accountable.name}>
                          {row.accountable.name.split(' ').map((w: string) => w[0]).join('')}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <RaciCell label="C" color="bg-amber-100 text-amber-800" members={row.consultedMembers ?? []} />
                  </td>
                  <td className="px-3 py-2.5">
                    <RaciCell label="I" color="bg-purple-100 text-purple-800" members={row.informedMembers ?? []} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(row)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Edit">✏</button>
                      <button onClick={() => { if (confirm('Delete this RACI entry?')) deleteMut.mutate(row.id); }}
                        className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-gray-500 pt-1">
        <span><span className="font-bold text-green-700">R</span> — Responsible: does the work</span>
        <span><span className="font-bold text-blue-700">A</span> — Accountable: owns the outcome</span>
        <span><span className="font-bold text-amber-700">C</span> — Consulted: input before action</span>
        <span><span className="font-bold text-purple-700">I</span> — Informed: notified after action</span>
      </div>
    </div>
  );
}
