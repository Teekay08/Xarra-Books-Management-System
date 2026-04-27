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
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mt-6">
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

  const projects = data?.data ?? [];
  const stats = data?.stats ?? {};

  const active    = projects.filter((p: any) => p.status === 'ACTIVE');
  const onHold    = projects.filter((p: any) => p.status === 'ON_HOLD');
  const completed = projects.filter((p: any) => p.status === 'COMPLETED');
  const redHealth = active.filter((p: any) => p.healthStatus === 'R').length;
  const amberHealth = active.filter((p: any) => p.healthStatus === 'A').length;

  return (
    <div>
      <PageHeader
        title="Billetterie Software"
        subtitle="Project management hub"
        action={
          <Link
            to="/billetterie/projects/new"
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            New Project
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Active',    value: active.length,    color: 'text-blue-700' },
          { label: 'On Hold',   value: onHold.length,    color: 'text-yellow-700' },
          { label: 'Completed', value: completed.length, color: 'text-green-700' },
          { label: 'Total',     value: projects.length,  color: 'text-gray-900' },
          { label: '🔴 Red',    value: redHealth,        color: 'text-red-600' },
          { label: '🟡 Amber',  value: amberHealth,      color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Projects list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">All Projects</h2>
          <Link to="/billetterie/projects" className="text-xs text-blue-600 hover:underline">View all</Link>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-gray-400 text-sm">Loading projects…</div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No projects yet</p>
            <Link
              to="/billetterie/projects/new"
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Create First Project
            </Link>
          </div>
        )}

        {projects.length > 0 && (
          <div className="divide-y divide-gray-100">
            {projects.slice(0, 10).map((p: any) => (
              <Link
                key={p.id}
                to={`/billetterie/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0">
                    <p className="text-xs font-mono text-gray-400">{p.number}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.client || '—'}</p>
                    {p.projectType && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{p.projectType}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Health R/A/G */}
                  {p.healthStatus && (
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      p.healthStatus === 'R' ? 'bg-red-500' :
                      p.healthStatus === 'A' ? 'bg-amber-500' :
                      'bg-green-500'
                    }`} title={`Health: ${p.healthStatus === 'R' ? 'Red' : p.healthStatus === 'A' ? 'Amber' : 'Green'}`} />
                  )}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_COLORS[p.currentPhase] || 'bg-gray-100 text-gray-600'}`}>
                    {p.currentPhase?.replace(/_/g, ' ')}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                  {/* Adaptive indicator */}
                  {p.isAdaptive && (
                    <span className="text-[9px] font-bold px-1 py-0.5 bg-purple-100 text-purple-700 rounded" title="Adaptive project">A</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <OrgSettingsPanel />
    </div>
  );
}
