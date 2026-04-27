import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface Risk {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  probability: number;
  impact: number;
  score: number;
  mitigation: string | null;
  ownerId: string | null;
  reviewDate: string | null;
  status: 'OPEN' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED';
  owner: { id: string; name: string; role: string } | null;
  createdAt: string;
}

const STATUS_STYLES: Record<Risk['status'], string> = {
  OPEN:      'bg-red-100 text-red-800',
  MITIGATED: 'bg-amber-100 text-amber-800',
  ACCEPTED:  'bg-blue-100 text-blue-800',
  CLOSED:    'bg-green-100 text-green-800',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 15) return 'bg-red-600 text-white';
  if (score >= 10) return 'bg-orange-500 text-white';
  if (score >= 5)  return 'bg-amber-400 text-white';
  return 'bg-green-500 text-white';
};

const SCORE_LABEL = (score: number) => {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5)  return 'Medium';
  return 'Low';
};

const CATEGORIES = ['Technical', 'Commercial', 'Resource', 'Timeline', 'Compliance', 'External', 'Other'];

interface Props { projectId: string }

export function BilletterieRiskMatrix({ projectId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [form, setForm] = useState<Partial<{
    title: string; description: string; category: string; probability: number; impact: number;
    mitigation: string; ownerId: string; reviewDate: string; status: Risk['status'];
  }>>({ probability: 1, impact: 1, status: 'OPEN' });

  const { data: risksData, isLoading } = useQuery({
    queryKey: ['bil-risks', projectId],
    queryFn: () => api<{ data: Risk[] }>(`/billetterie/projects/${projectId}/risks`),
  });

  const { data: teamData } = useQuery({
    queryKey: ['bil-team-staff', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });

  const staff = (teamData?.data ?? []).map((m: any) => ({
    id: m.staffMemberId ?? m.id,
    name: m.name,
    role: m.memberRole ?? m.role ?? '',
  })).filter((m: any) => m.name);

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/risks`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-risks', projectId] }); setAdding(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api(`/billetterie/projects/${projectId}/risks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-risks', projectId] }); setEditId(null); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/billetterie/projects/${projectId}/risks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-risks', projectId] }),
  });

  function resetForm() {
    setForm({ probability: 1, impact: 1, status: 'OPEN' });
  }

  function startEdit(r: Risk) {
    setForm({
      title: r.title, description: r.description ?? '', category: r.category ?? '',
      probability: r.probability, impact: r.impact, mitigation: r.mitigation ?? '',
      ownerId: r.ownerId ?? '', reviewDate: r.reviewDate ?? '', status: r.status,
    });
    setEditId(r.id);
    setAdding(false);
  }

  function saveRisk() {
    if (!form.title?.trim()) return;
    const body = {
      title: form.title, description: form.description || null, category: form.category || null,
      probability: form.probability ?? 1, impact: form.impact ?? 1,
      mitigation: form.mitigation || null, ownerId: form.ownerId || null,
      reviewDate: form.reviewDate || null, status: form.status ?? 'OPEN',
    };
    if (editId) updateMut.mutate({ id: editId, body });
    else createMut.mutate(body);
  }

  const allRisks: Risk[] = risksData?.data ?? [];
  const risks = filterStatus === 'all' ? allRisks : allRisks.filter(r => r.status === filterStatus);

  // Risk heatmap data
  const heatmapCounts: Record<string, number> = {};
  for (const r of allRisks.filter(r => r.status === 'OPEN' || r.status === 'MITIGATED')) {
    const key = `${r.probability}-${r.impact}`;
    heatmapCounts[key] = (heatmapCounts[key] ?? 0) + 1;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Risk Matrix</h2>
          <p className="text-xs text-gray-500 mt-0.5">Identify, assess and track project risks — Score = Probability × Impact (1–5)</p>
        </div>
        <button onClick={() => { resetForm(); setAdding(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + Add Risk
        </button>
      </div>

      {/* Heatmap */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Risk Heatmap (open + mitigated)</h3>
        <div className="flex gap-3">
          <div className="flex flex-col-reverse gap-1">
            {[1,2,3,4,5].map(p => (
              <div key={p} className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-3">{p}</span>
                {[1,2,3,4,5].map(i => {
                  const score = p * i;
                  const count = heatmapCounts[`${p}-${i}`] ?? 0;
                  const bg = score >= 15 ? 'bg-red-500' : score >= 10 ? 'bg-orange-400' : score >= 5 ? 'bg-amber-300' : 'bg-green-300';
                  return (
                    <div key={i} className={`w-9 h-9 rounded flex items-center justify-center text-xs font-bold text-white ${bg} ${count ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-40'}`}>
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-between ml-1">
            <span className="text-[9px] text-gray-400 rotate-[-90deg] translate-y-4 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>← Probability</span>
          </div>
          <div className="flex flex-col justify-end gap-1 pt-4">
            {[1,2,3,4,5].map(i => <span key={i} className="text-[9px] text-gray-400 w-9 text-center">{i}</span>)}
            <span className="text-[9px] text-gray-400 text-center whitespace-nowrap">Impact →</span>
          </div>
          <div className="ml-4 flex flex-col gap-1.5 justify-center">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /><span className="text-[10px] text-gray-600">Critical (15–25)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-400" /><span className="text-[10px] text-gray-600">High (10–14)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-300" /><span className="text-[10px] text-gray-600">Medium (5–9)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-300" /><span className="text-[10px] text-gray-600">Low (1–4)</span></div>
          </div>
        </div>
      </div>

      {/* Form */}
      {(adding || editId) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-900">{editId ? 'Edit Risk' : 'New Risk'}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Risk Title *</label>
              <input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Describe the risk..."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Probability (1–5)</label>
              <input type="number" min={1} max={5} value={form.probability ?? 1}
                onChange={e => setForm(f => ({ ...f, probability: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Impact (1–5)</label>
              <input type="number" min={1} max={5} value={form.impact ?? 1}
                onChange={e => setForm(f => ({ ...f, impact: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <div className="mt-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SCORE_COLOR((form.probability ?? 1) * (form.impact ?? 1))}`}>
                  Score {(form.probability ?? 1) * (form.impact ?? 1)} — {SCORE_LABEL((form.probability ?? 1) * (form.impact ?? 1))}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status ?? 'OPEN'} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="OPEN">Open</option>
                <option value="MITIGATED">Mitigated</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Risk Owner</label>
              <select value={form.ownerId ?? ''} onChange={e => setForm(f => ({ ...f, ownerId: e.target.value || undefined }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Unassigned</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Review Date</label>
              <input type="date" value={form.reviewDate ?? ''} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Mitigation Plan</label>
              <textarea value={form.mitigation ?? ''} onChange={e => setForm(f => ({ ...f, mitigation: e.target.value }))} rows={2}
                placeholder="How will this risk be mitigated or managed?"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveRisk} disabled={!form.title?.trim() || createMut.isPending || updateMut.isPending}
              className="px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {createMut.isPending || updateMut.isPending ? 'Saving…' : 'Save Risk'}
            </button>
            <button onClick={() => { setAdding(false); setEditId(null); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['all', 'OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${filterStatus === s ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {s === 'all' ? `All (${allRisks.length})` : `${s[0] + s.slice(1).toLowerCase()} (${allRisks.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Risk list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading risks…</div>
      ) : risks.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">⚠</div>
          <p className="text-sm font-medium text-gray-500">No risks {filterStatus !== 'all' ? `with status "${filterStatus}"` : 'recorded'}</p>
          <p className="text-xs text-gray-400 mt-1">Proactively identify risks to keep the project on track</p>
        </div>
      ) : (
        <div className="space-y-2">
          {risks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(risk => (
            <div key={risk.id} className="bg-white border border-gray-200 rounded-xl p-4 group">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                  <span className={`text-sm font-black px-2 py-1 rounded ${SCORE_COLOR(risk.score)}`}>{risk.score}</span>
                  <span className="text-[9px] text-gray-400 font-medium">{SCORE_LABEL(risk.score)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">{risk.title}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[risk.status]}`}>{risk.status}</span>
                    {risk.category && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{risk.category}</span>}
                  </div>
                  {risk.description && <p className="text-xs text-gray-500 mb-1">{risk.description}</p>}
                  <div className="flex items-center gap-4 text-[10px] text-gray-400">
                    <span>P:{risk.probability} × I:{risk.impact}</span>
                    {risk.owner && <span>Owner: <span className="text-gray-600">{risk.owner.name}</span></span>}
                    {risk.reviewDate && <span>Review: {new Date(risk.reviewDate).toLocaleDateString('en-ZA')}</span>}
                  </div>
                  {risk.mitigation && (
                    <div className="mt-2 text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1">
                      <span className="font-medium text-gray-700">Mitigation: </span>{risk.mitigation}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => startEdit(risk)} className="p-1 text-gray-400 hover:text-blue-600 rounded text-sm">✏</button>
                  <button onClick={() => { if (confirm('Delete this risk?')) deleteMut.mutate(risk.id); }}
                    className="p-1 text-gray-400 hover:text-red-600 rounded text-sm">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
