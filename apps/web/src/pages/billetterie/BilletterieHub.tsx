import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const PHASE_COLORS: Record<string, string> = {
  INITIATION:   'bg-slate-100 text-slate-700',
  ELICITATION:  'bg-purple-100 text-purple-700',
  ARCHITECTURE: 'bg-indigo-100 text-indigo-700',
  DEVELOPMENT:  'bg-blue-100 text-blue-700',
  TESTING:      'bg-yellow-100 text-yellow-700',
  SIGN_OFF:     'bg-orange-100 text-orange-700',
  CLOSURE:      'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

function OrgSettingsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: orgData } = useQuery({
    queryKey: ['bil-org-settings'],
    queryFn:  () => api<{ data: any }>('/billetterie/org-settings'),
    enabled:  open,
  });
  const [form, setForm] = useState<any>(null);

  function startEdit() {
    setForm({ ...(orgData?.data ?? {}) });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: (body: any) => api('/billetterie/org-settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['bil-org-settings'] }); setForm(null); },
  });

  const org = orgData?.data;

  return (
    <div className="card overflow-hidden mt-6">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Billetterie Org Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">Controls branding on all Billetterie-generated documents (SOW, reports)</p>
        </div>
        <button onClick={startEdit} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
          {form ? 'Editing…' : 'Edit'}
        </button>
      </div>
      {!form ? (
        <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Display Name</p>
            <p className="font-medium">{org?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="font-medium">{org?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="font-medium">{org?.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Address</p>
            <p className="font-medium">{[org?.addressLine1, org?.city, org?.province].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Accent Colour</p>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: org?.accentColor ?? '#1d4ed8' }} />
              <span className="font-mono text-xs">{org?.accentColor ?? '#1d4ed8'}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Logo URL</p>
            <p className="font-medium text-xs truncate">{org?.logoUrl ?? '—'}</p>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['displayName', 'Display Name *'],
              ['tagline', 'Tagline'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['addressLine1', 'Address Line 1'],
              ['city', 'City'],
              ['province', 'Province'],
              ['postalCode', 'Postal Code'],
              ['vatNumber', 'VAT Number'],
              ['registrationNumber', 'Reg Number'],
              ['website', 'Website'],
              ['logoUrl', 'Logo URL'],
              ['accentColor', 'Accent Colour (#hex)'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input value={form[key] ?? ''} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">SOW Footer Text</label>
              <textarea value={form.sowFooterText ?? ''} onChange={e => setForm((f: any) => ({ ...f, sowFooterText: e.target.value }))} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Report Footer Text</label>
              <textarea value={form.reportFooterText ?? ''} onChange={e => setForm((f: any) => ({ ...f, reportFooterText: e.target.value }))} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saveMut.isPending ? 'Saving…' : 'Save Settings'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BilletterieHub() {
  const { data, isLoading } = useQuery({
    queryKey: ['billetterie-projects'],
    queryFn: () => api<{ data: any[]; stats: any }>('/billetterie/projects?limit=50'),
  });

  const projects    = data?.data ?? [];
  const active      = projects.filter((p: any) => p.status === 'ACTIVE');
  const onHold      = projects.filter((p: any) => p.status === 'ON_HOLD');
  const completed   = projects.filter((p: any) => p.status === 'COMPLETED');
  const redHealth   = active.filter((p: any) => p.healthStatus === 'R').length;
  const amberHealth = active.filter((p: any) => p.healthStatus === 'A').length;
  const greenHealth = active.filter((p: any) => p.healthStatus === 'G').length;

  return (
    <div className="space-y-5">
      {/* ── Greeting + New Project ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Billetterie Hub</h1>
          <p className="text-xs text-gray-400 mt-0.5">Software Project Management</p>
        </div>
        <Link to="/billetterie/projects/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Project
        </Link>
      </div>

      {/* ── Portfolio overview strip ─────────────────────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Active',    value: active.length,    icon: '▶', color: 'text-blue-700',   bg: 'bg-blue-50' },
          { label: 'On Hold',   value: onHold.length,    icon: '⏸', color: 'text-amber-700',  bg: 'bg-amber-50' },
          { label: 'Completed', value: completed.length, icon: '✓',  color: 'text-green-700',  bg: 'bg-green-50' },
          { label: 'Total',     value: projects.length,  icon: '◈',  color: 'text-gray-700',   bg: 'bg-gray-50' },
          { label: 'Red Health', value: redHealth,       icon: '●',  color: 'text-red-600',    bg: redHealth > 0 ? 'bg-red-50' : 'bg-gray-50' },
          { label: 'Amber',     value: amberHealth,      icon: '●',  color: 'text-amber-600',  bg: amberHealth > 0 ? 'bg-amber-50' : 'bg-gray-50' },
        ].map(s => (
          <div key={s.label} className={`card p-4 border ${s.bg}`}>
            <p className={`text-lg font-black leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Health banner (only shown if any red or amber) ────────── */}
      {(redHealth > 0 || amberHealth > 0) && (
        <div className={`rounded-xl border px-5 py-3 flex items-center gap-3 ${redHealth > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className={`h-2 w-2 rounded-full shrink-0 ${redHealth > 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
          <p className={`text-sm font-semibold ${redHealth > 0 ? 'text-red-800' : 'text-amber-800'}`}>
            {redHealth > 0
              ? `${redHealth} project${redHealth > 1 ? 's' : ''} marked RED — immediate attention required`
              : `${amberHealth} project${amberHealth > 1 ? 's' : ''} marked AMBER — monitor closely`}
          </p>
          <Link to="/billetterie/projects" className="ml-auto text-xs font-semibold underline opacity-70 hover:opacity-100">
            Review now →
          </Link>
        </div>
      )}

      {/* ── Project cards grid ───────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">All Projects ({projects.length})</h2>
          <Link to="/billetterie/projects" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>

        {isLoading && (
          <div className="p-10 text-center text-gray-400 text-sm">Loading projects…</div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="p-14 text-center space-y-3">
            <div className="text-4xl opacity-20">📁</div>
            <p className="text-sm font-medium text-gray-500">No projects yet</p>
            <Link to="/billetterie/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              Create First Project
            </Link>
          </div>
        )}

        {projects.length > 0 && (
          <div className="divide-y divide-gray-100">
            {projects.slice(0, 12).map((p: any) => (
              <Link
                key={p.id}
                to={`/billetterie/projects/${p.id}`}
                className="group flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/30 transition-colors"
              >
                {/* Health dot */}
                <div className="shrink-0">
                  <span className={`block h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    p.healthStatus === 'R' ? 'bg-red-500' :
                    p.healthStatus === 'A' ? 'bg-amber-400' :
                    p.healthStatus === 'G' ? 'bg-green-500' :
                    'bg-gray-200'
                  }`} title={p.healthStatus ? `Health: ${p.healthStatus === 'R' ? 'Red' : p.healthStatus === 'A' ? 'Amber' : 'Green'}` : 'No health set'} />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{p.name}</p>
                    {p.isAdaptive && (
                      <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 bg-purple-100 text-purple-600 rounded">Adaptive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] font-mono text-gray-400">{p.number}</p>
                    {p.client && <p className="text-[10px] text-gray-400">· {p.client}</p>}
                  </div>
                </div>

                {/* Phase + status badges */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`pill ${PHASE_COLORS[p.currentPhase] || 'bg-gray-100 text-gray-500'}`}>
                    {p.currentPhase?.replace(/_/g, ' ')}
                  </span>
                  <span className={`pill ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>

                <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>

      <OrgSettingsPanel />
    </div>
  );
}
