import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

type CRStatus  = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED' | 'WITHDRAWN';
type CRType    = 'SCOPE' | 'TIMELINE' | 'BUDGET' | 'TECHNICAL' | 'PROCESS' | 'OTHER';
type CRImpact  = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CR {
  id: string;
  crNumber: number;
  title: string;
  description: string;
  type: CRType;
  status: CRStatus;
  impactScope: CRImpact;
  impactTimeline: CRImpact;
  impactBudget: CRImpact;
  impactRisk: CRImpact;
  justification: string | null;
  alternatives: string | null;
  rollbackPlan: string | null;
  estimatedEffortDays: string | null;
  estimatedCost: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  requestedBy: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  implementedAt: string | null;
  implementationNotes: string | null;
  tags: string[];
  createdAt: string;
}

const STATUS_STYLES: Record<CRStatus, string> = {
  DRAFT:        'bg-gray-100 text-gray-700',
  SUBMITTED:    'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED:     'bg-green-100 text-green-800',
  REJECTED:     'bg-red-100 text-red-800',
  IMPLEMENTED:  'bg-purple-100 text-purple-800',
  WITHDRAWN:    'bg-gray-100 text-gray-500',
};

const IMPACT_COLOR: Record<CRImpact, string> = {
  NONE:     'text-gray-400',
  LOW:      'text-green-600',
  MEDIUM:   'text-amber-600',
  HIGH:     'text-orange-600',
  CRITICAL: 'text-red-700',
};

function ImpactDot({ level }: { level: CRImpact }) {
  const colors: Record<CRImpact, string> = {
    NONE: 'bg-gray-200', LOW: 'bg-green-400', MEDIUM: 'bg-amber-400', HIGH: 'bg-orange-500', CRITICAL: 'bg-red-600',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[level]}`} title={level} />;
}

function CRDetail({ cr, projectId, onClose }: { cr: CR; projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [approveNotes, setApproveNotes] = useState('');
  const [implementNotes, setImplementNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const actionMut = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: any }) =>
      api(`/billetterie/projects/${projectId}/change-requests/${cr.id}/${action}`, {
        method: 'POST', body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-crs', projectId] }); onClose(); },
  });

  const impact = [
    { label: 'Scope',    val: cr.impactScope },
    { label: 'Timeline', val: cr.impactTimeline },
    { label: 'Budget',   val: cr.impactBudget },
    { label: 'Risk',     val: cr.impactRisk },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-gray-400">CR-{String(cr.crNumber).padStart(3, '0')}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[cr.status]}`}>{cr.status.replace('_', ' ')}</span>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cr.type.replace('_', ' ')}</span>
            </div>
            <h2 className="text-base font-semibold text-gray-900">{cr.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Description</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{cr.description}</p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {impact.map(i => (
              <div key={i.label} className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">{i.label} Impact</div>
                <div className={`text-xs font-bold ${IMPACT_COLOR[i.val]}`}>{i.val}</div>
              </div>
            ))}
          </div>

          {cr.justification && <div><div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Justification</div><p className="text-sm text-gray-700">{cr.justification}</p></div>}
          {cr.alternatives && <div><div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Alternatives Considered</div><p className="text-sm text-gray-700">{cr.alternatives}</p></div>}
          {cr.rollbackPlan && <div><div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Rollback Plan</div><p className="text-sm text-gray-700">{cr.rollbackPlan}</p></div>}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {cr.estimatedEffortDays && <div><span className="text-gray-500 text-xs">Estimated Effort: </span><strong>{cr.estimatedEffortDays} days</strong></div>}
            {cr.estimatedCost && <div><span className="text-gray-500 text-xs">Estimated Cost: </span><strong>R {Number(cr.estimatedCost).toLocaleString('en-ZA')}</strong></div>}
            {cr.proposedStart && <div><span className="text-gray-500 text-xs">Start: </span><strong>{cr.proposedStart}</strong></div>}
            {cr.proposedEnd && <div><span className="text-gray-500 text-xs">End: </span><strong>{cr.proposedEnd}</strong></div>}
          </div>

          {cr.reviewNotes && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><div className="text-[10px] font-bold text-amber-700 mb-1">REVIEW NOTES</div><p className="text-sm text-amber-800">{cr.reviewNotes}</p></div>}
          {cr.approvalNotes && <div className={`border rounded-lg p-3 ${cr.status === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className={`text-[10px] font-bold mb-1 ${cr.status === 'APPROVED' ? 'text-green-700' : 'text-red-700'}`}>{cr.status === 'APPROVED' ? 'APPROVAL NOTES' : 'REJECTION REASON'}</div><p className="text-sm">{cr.approvalNotes}</p></div>}
          {cr.implementationNotes && <div className="bg-purple-50 border border-purple-200 rounded-lg p-3"><div className="text-[10px] font-bold text-purple-700 mb-1">IMPLEMENTATION NOTES</div><p className="text-sm text-purple-800">{cr.implementationNotes}</p></div>}

          {/* CAB Action buttons */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            {cr.status === 'DRAFT' && (
              <button onClick={() => actionMut.mutate({ action: 'submit' })} disabled={actionMut.isPending}
                className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Submit for Review
              </button>
            )}
            {cr.status === 'SUBMITTED' && (
              <div className="space-y-2">
                <input value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Review notes…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => actionMut.mutate({ action: 'review', body: { notes: reviewNotes } })} disabled={actionMut.isPending}
                  className="w-full py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  Mark Under Review
                </button>
              </div>
            )}
            {cr.status === 'UNDER_REVIEW' && (
              <div className="space-y-2">
                <input value={approveNotes} onChange={e => setApproveNotes(e.target.value)} placeholder="Decision notes…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => actionMut.mutate({ action: 'approve', body: { approve: true, notes: approveNotes } })} disabled={actionMut.isPending}
                    className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                    ✓ Approve
                  </button>
                  <button onClick={() => actionMut.mutate({ action: 'approve', body: { approve: false, notes: approveNotes } })} disabled={actionMut.isPending}
                    className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                    ✕ Reject
                  </button>
                </div>
              </div>
            )}
            {cr.status === 'APPROVED' && (
              <div className="space-y-2">
                <input value={implementNotes} onChange={e => setImplementNotes(e.target.value)} placeholder="Implementation notes…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => actionMut.mutate({ action: 'implement', body: { notes: implementNotes } })} disabled={actionMut.isPending}
                  className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  Mark Implemented
                </button>
              </div>
            )}
            {['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'].includes(cr.status) && (
              <button onClick={() => { if (confirm('Withdraw this change request?')) actionMut.mutate({ action: 'withdraw' }); }} disabled={actionMut.isPending}
                className="w-full py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props { projectId: string }

export function BilletterieChangeRequests({ projectId }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('active');
  const [creating, setCreating] = useState(false);
  const [selected, setCR] = useState<CR | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', type: 'OTHER' as CRType,
    impactScope: 'NONE' as CRImpact, impactTimeline: 'NONE' as CRImpact,
    impactBudget: 'NONE' as CRImpact, impactRisk: 'NONE' as CRImpact,
    justification: '', rollbackPlan: '',
  });

  const { data: crsData, isLoading } = useQuery({
    queryKey: ['bil-crs', projectId, statusFilter],
    queryFn: () => api<{ data: CR[] }>(`/billetterie/projects/${projectId}/change-requests`),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/change-requests`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-crs', projectId] }); setCreating(false); },
  });

  const ACTIVE_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
  const allCRs: CR[] = crsData?.data ?? [];
  const filteredCRs = statusFilter === 'active' ? allCRs.filter(c => ACTIVE_STATUSES.includes(c.status))
    : statusFilter === 'closed' ? allCRs.filter(c => ['IMPLEMENTED', 'REJECTED', 'WITHDRAWN'].includes(c.status))
    : allCRs;

  const workflowSteps = [
    { s: 'DRAFT', label: 'Draft', count: allCRs.filter(c => c.status === 'DRAFT').length },
    { s: 'SUBMITTED', label: 'Submitted', count: allCRs.filter(c => c.status === 'SUBMITTED').length },
    { s: 'UNDER_REVIEW', label: 'Under Review', count: allCRs.filter(c => c.status === 'UNDER_REVIEW').length },
    { s: 'APPROVED', label: 'Approved', count: allCRs.filter(c => c.status === 'APPROVED').length },
    { s: 'IMPLEMENTED', label: 'Implemented', count: allCRs.filter(c => c.status === 'IMPLEMENTED').length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Change Requests (CAB)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Formal change management process with CAB review and Sponsor approval</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + New CR
        </button>
      </div>

      {/* Pipeline */}
      <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
        {workflowSteps.map((step, i) => (
          <div key={step.s} className="flex-1 flex items-center gap-1">
            <div className="flex-1 text-center">
              <div className={`text-lg font-black ${step.count > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{step.count}</div>
              <div className="text-[9px] text-gray-500 font-medium">{step.label}</div>
            </div>
            {i < workflowSteps.length - 1 && <span className="text-gray-300 text-xs">›</span>}
          </div>
        ))}
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">New Change Request</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Brief description of the requested change…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                placeholder="Detailed description of the change and its purpose…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CRType }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {(['SCOPE', 'TIMELINE', 'BUDGET', 'TECHNICAL', 'PROCESS', 'OTHER'] as CRType[]).map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1 col-span-1">
              {(['impactScope', 'impactTimeline', 'impactBudget', 'impactRisk'] as const).map(field => (
                <div key={field}>
                  <label className="block text-[9px] font-medium text-gray-600 mb-0.5">{field.replace('impact', '').replace(/([A-Z])/, ' $1').trim()} Impact</label>
                  <select value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value as CRImpact }))}
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                    {(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as CRImpact[]).map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Justification</label>
              <textarea value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))} rows={2}
                placeholder="Why is this change necessary?"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Rollback Plan</label>
              <textarea value={form.rollbackPlan} onChange={e => setForm(f => ({ ...f, rollbackPlan: e.target.value }))} rows={2}
                placeholder="How will this be rolled back if it fails?"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate({
              title: form.title, description: form.description, type: form.type,
              impactScope: form.impactScope, impactTimeline: form.impactTimeline,
              impactBudget: form.impactBudget, impactRisk: form.impactRisk,
              justification: form.justification || null, rollbackPlan: form.rollbackPlan || null,
            })} disabled={!form.title.trim() || !form.description.trim() || createMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Change Request'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
        {[['active', 'Active'], ['closed', 'Closed'], ['all', 'All']].map(([v, l]) => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* CR list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading change requests…</div>
      ) : filteredCRs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">🔄</div>
          <p className="text-sm font-medium text-gray-500">No change requests</p>
          <p className="text-xs text-gray-400 mt-1">Raise a CR to formally request a change to scope, timeline, budget or architecture</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCRs.map(cr => (
            <div key={cr.id} onClick={() => setCR(cr)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-gray-400">CR-{String(cr.crNumber).padStart(3, '0')}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[cr.status]}`}>{cr.status.replace('_', ' ')}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cr.type.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{cr.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <span>Impact:</span>
                      <ImpactDot level={cr.impactScope} /><span className={IMPACT_COLOR[cr.impactScope]}>S</span>
                      <ImpactDot level={cr.impactTimeline} /><span className={IMPACT_COLOR[cr.impactTimeline]}>T</span>
                      <ImpactDot level={cr.impactBudget} /><span className={IMPACT_COLOR[cr.impactBudget]}>B</span>
                      <ImpactDot level={cr.impactRisk} /><span className={IMPACT_COLOR[cr.impactRisk]}>R</span>
                    </div>
                    {cr.estimatedEffortDays && <span className="text-[10px] text-gray-400">{cr.estimatedEffortDays}d effort</span>}
                    <span className="ml-auto text-[10px] text-gray-400">
                      {new Date(cr.createdAt).toLocaleDateString('en-ZA')}
                    </span>
                  </div>
                </div>
                <span className="text-gray-300 group-hover:text-blue-400 text-sm flex-shrink-0">›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <CRDetail cr={selected} projectId={projectId} onClose={() => setCR(null)} />}
    </div>
  );
}
