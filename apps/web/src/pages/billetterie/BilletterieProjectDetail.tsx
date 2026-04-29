import { useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import {
  PHASES, CLR, PHASE_IDX, PROJECT_STATUS_BADGE, MILESTONE_STATUS_BADGE,
  TEAM_ROLE_LABEL, TEAM_ROLE_BADGE, getInitials, formatRelativeTime, type PhaseKey,
} from './billetterie-constants';
import { BilletterieKanban }        from './components/BilletterieKanban';
import { BilletterieTimeline }       from './components/BilletterieTimeline';
import { BilletterieIssueList }      from './components/BilletterieIssueList';
import { BilletterieTimesheetGrid }  from './components/BilletterieTimesheetGrid';
import { BilletterieTeamPanel }      from './components/BilletterieTeamPanel';
import { BilletterieActivityFeed }   from './components/BilletterieActivityFeed';
import { PhaseDeliverables }         from './components/PhaseDeliverables';
import { BilletterieRaciMatrix }     from './components/BilletterieRaciMatrix';
import { BilletterieRiskMatrix }     from './components/BilletterieRiskMatrix';
import { BilletterieSprints }        from './components/BilletterieSprints';
import { BilletterieReports }        from './components/BilletterieReports';
import { BilletterieSupport }        from './components/BilletterieSupport';
import { BilletterieChangeRequests } from './components/BilletterieChangeRequests';
import { BilletterieTesting }        from './components/BilletterieTesting';

// ─── Phase stepper ────────────────────────────────────────────────────────────

function PhaseStepper({ currentPhase, phaseMap }: { currentPhase: string; phaseMap: Map<string, any> }) {
  const currentIdx = PHASE_IDX[currentPhase as PhaseKey] ?? 0;
  return (
    <div className="relative">
      <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
      <div className="relative flex justify-between">
        {PHASES.map((phase, idx) => {
          const phaseData = phaseMap.get(phase.key);
          const isCompleted = idx < currentIdx || phaseData?.status === 'APPROVED';
          const isCurrent = idx === currentIdx;
          const c = CLR[phase.color];
          return (
            <div key={phase.key} className="flex flex-col items-center gap-1" style={{ width: `${100 / PHASES.length}%` }}>
              <div className={`relative z-10 h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${isCompleted ? 'bg-green-500 border-green-500 text-white' : isCurrent ? `${c.dot} border-current text-white` : 'bg-white border-gray-300 text-gray-400'}`}>
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span className={`text-[10px] font-medium text-center leading-tight ${isCurrent ? c.text : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gate documents panel ────────────────────────────────────────────────────

function GateDocuments({ projectId, phaseKey, phaseData, isLocked }: {
  projectId: string; phaseKey: string; phaseData: any; isLocked: boolean;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function toggleDoc(docName: string) {
    if (isLocked || saving) return;
    setSaving(true);
    const current: any[] = phaseData?.gateDocuments ?? [];
    const updated = current.map((d: any) =>
      d.name === docName ? { ...d, status: d.status === 'APPROVED' ? 'PENDING' : 'APPROVED', uploadedAt: new Date().toISOString() } : d,
    );
    await api(`/billetterie/projects/${projectId}/phases/${phaseKey}`, {
      method: 'PUT', body: JSON.stringify({ gateDocuments: updated }),
    });
    queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
    setSaving(false);
  }

  const docs: any[] = phaseData?.gateDocuments ?? [];

  return (
    <div className="space-y-1.5">
      {docs.map((doc: any) => (
        <div key={doc.name} className="flex items-center gap-3 py-1">
          <button
            onClick={() => toggleDoc(doc.name)}
            disabled={isLocked || saving}
            className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-all ${doc.status === 'APPROVED' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'} ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {doc.status === 'APPROVED' && <span className="text-[10px] font-bold">✓</span>}
          </button>
          <span className={`text-sm ${doc.status === 'APPROVED' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{doc.name}</span>
          <span className={`ml-auto text-xs font-medium ${doc.status === 'APPROVED' ? 'text-green-600' : !isLocked ? 'text-amber-600' : 'text-gray-400'}`}>
            {doc.status === 'APPROVED' ? 'Approved' : !isLocked ? 'Required' : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Phase panel ─────────────────────────────────────────────────────────────

function PhasePanel({ projectId, currentPhase, phaseMap, onAdvance, advancing }: {
  projectId: string; currentPhase: string; phaseMap: Map<string, any>;
  onAdvance: () => void; advancing: boolean;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PhaseKey>(currentPhase as PhaseKey);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const activeIdx  = PHASE_IDX[activeTab] ?? 0;
  const currentIdx = PHASE_IDX[currentPhase as PhaseKey] ?? 0;
  const phaseConfig = PHASES[activeIdx];
  const c = CLR[phaseConfig.color];
  const phaseData = phaseMap.get(activeTab);
  const isLocked  = activeIdx > currentIdx;
  const isApproved = phaseData?.status === 'APPROVED';
  const isActive   = activeIdx === currentIdx;

  async function saveNote() {
    setSavingNote(true);
    await api(`/billetterie/projects/${projectId}/phases/${activeTab}`, {
      method: 'PUT', body: JSON.stringify({ notes: noteDraft }),
    });
    queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
    setSavingNote(false);
    setEditingNotes(false);
  }

  return (
    <div className="card p-4">
      {/* Phase tabs */}
      <div className="flex gap-1 flex-wrap mb-5">
        {PHASES.map((phase, idx) => {
          const pd = phaseMap.get(phase.key);
          const done = idx < currentIdx || pd?.status === 'APPROVED';
          const cl = CLR[phase.color];
          return (
            <button key={phase.key} onClick={() => setActiveTab(phase.key as PhaseKey)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === phase.key ? cl.badge : done ? 'bg-green-50 text-green-700' : idx > currentIdx ? 'bg-gray-50 text-gray-400 cursor-default' : 'text-gray-600 hover:bg-gray-100'}`}>
              {done && idx < currentIdx ? '✓ ' : ''}{phase.label}
            </button>
          );
        })}
      </div>

      <div className={`rounded-lg border ${c.border} ${c.bg} p-5`}>
        <div className="flex items-start justify-between mb-4">
          <h3 className={`text-base font-semibold ${c.text}`}>{phaseConfig.label}</h3>
          {isLocked   && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">Locked</span>}
          {isApproved && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Approved</span>}
          {!isLocked && !isApproved && isActive && <span className={`rounded-full ${c.badge} px-3 py-1 text-xs font-medium`}>Active</span>}
        </div>

        {/* Phase deliverables — primary planning tool */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Phase Deliverables</p>
          <PhaseDeliverables
            projectId={projectId}
            phaseKey={activeTab}
            phaseStatus={phaseData?.status ?? (isLocked ? 'LOCKED' : 'ACTIVE')}
            canEdit={!isLocked}
          />
        </div>

        {/* Legacy gate documents (hidden — kept for backward compat) */}
        <details className="mb-5">
          <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600">
            Gate Documents (legacy checklist)
          </summary>
          <div className="mt-2">
            <GateDocuments projectId={projectId} phaseKey={activeTab} phaseData={phaseData} isLocked={isLocked} />
          </div>
        </details>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase Notes</p>
            {!isLocked && !editingNotes && (
              <button onClick={() => { setNoteDraft(phaseData?.notes ?? ''); setEditingNotes(true); }}
                className="text-xs text-blue-600 hover:underline">{phaseData?.notes ? 'Edit' : '+ Add notes'}</button>
            )}
          </div>
          {editingNotes ? (
            <div>
              <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Add notes for this phase…" />
              <div className="flex gap-2 mt-2">
                <button onClick={saveNote} disabled={savingNote}
                  className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {savingNote ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingNotes(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">{phaseData?.notes || <span className="text-gray-400 italic">No notes</span>}</p>
          )}
        </div>

        {!isLocked && !isApproved && isActive && (
          <div className="mt-5 pt-4 border-t border-white/60 flex items-center gap-3">
            <button onClick={onAdvance} disabled={advancing}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${c.btn}`}>
              {advancing ? 'Advancing…' : `Complete ${phaseConfig.label} & Advance →`}
            </button>
            <p className="text-xs text-gray-500">Ensure all gate documents are approved first.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meetings panel ───────────────────────────────────────────────────────────

function MeetingsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ title: '', meetingDate: '', attendees: '', agenda: '', minutes: '' });

  const { data } = useQuery({
    queryKey: ['bil-meetings', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/meetings`),
  });
  const meetings = data?.data ?? [];

  const addMutation = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/meetings`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bil-meetings', projectId] });
      setShowForm(false);
      setMeetingForm({ title: '', meetingDate: '', attendees: '', agenda: '', minutes: '' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} logged</p>
        <button onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-800">
          + Log Meeting
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-indigo-800 uppercase">Log Meeting</h4>
          <div className="grid grid-cols-2 gap-3">
            <input value={meetingForm.title} onChange={(e) => setMeetingForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Meeting title *" className="col-span-2 rounded border border-gray-300 px-3 py-1.5 text-sm" />
            <input type="date" value={meetingForm.meetingDate} onChange={(e) => setMeetingForm((f) => ({ ...f, meetingDate: e.target.value }))}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
            <input value={meetingForm.attendees} onChange={(e) => setMeetingForm((f) => ({ ...f, attendees: e.target.value }))}
              placeholder="Attendees (comma separated)" className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
          </div>
          <textarea value={meetingForm.agenda} onChange={(e) => setMeetingForm((f) => ({ ...f, agenda: e.target.value }))}
            placeholder="Agenda" rows={2} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <textarea value={meetingForm.minutes} onChange={(e) => setMeetingForm((f) => ({ ...f, minutes: e.target.value }))}
            placeholder="Minutes / notes" rows={3} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button
              onClick={() => addMutation.mutate({ ...meetingForm, attendees: meetingForm.attendees.split(',').map((a) => a.trim()).filter(Boolean) })}
              disabled={!meetingForm.title || !meetingForm.meetingDate || addMutation.isPending}
              className="rounded bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {addMutation.isPending ? 'Saving…' : 'Log Meeting'}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {meetings.length === 0 && !showForm && <p className="text-sm text-gray-400 text-center py-8">No meetings logged yet.</p>}

      <div className="space-y-3">
        {meetings.map((m: any) => (
          <div key={m.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{m.title}</p>
              <span className="text-xs text-gray-500">{new Date(m.meetingDate).toLocaleDateString('en-ZA')}</span>
            </div>
            {m.attendees?.length > 0 && (
              <p className="text-xs text-gray-500 mb-2">Attendees: {m.attendees.join(', ')}</p>
            )}
            {m.agenda  && <p className="text-xs text-gray-600 mb-1"><strong>Agenda:</strong> {m.agenda}</p>}
            {m.minutes && <p className="text-xs text-gray-600"><strong>Minutes:</strong> {m.minutes}</p>}
            {m.actionItems?.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-gray-500">Action items:</p>
                {m.actionItems.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className={a.done ? 'text-green-500' : 'text-gray-300'}>●</span>
                    <span className={a.done ? 'line-through text-gray-400' : ''}>{a.item}</span>
                    <span className="text-gray-400">— {a.owner}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings view ────────────────────────────────────────────────────────────

function SettingsView({ projectId, project }: { projectId: string; project: any }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: project.name ?? '',
    client: project.client ?? '',
    description: project.description ?? '',
    notes: project.notes ?? '',
    budget: project.budget ?? '',
    startDate: project.startDate ?? '',
    targetEndDate: project.targetEndDate ?? '',
    contactName: project.contactName ?? '',
    contactEmail: project.contactEmail ?? '',
    contactPhone: project.contactPhone ?? '',
    projectType: project.projectType ?? '',
    isAdaptive: project.isAdaptive ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Adaptive extension approval
  const [adaptiveReason, setAdaptiveReason] = useState('');
  const [savingAdaptive, setSavingAdaptive] = useState(false);

  async function approveAdaptiveExtension() {
    if (!adaptiveReason.trim()) return;
    if (!confirm('Approve the Day-20 adaptive extension for this project?')) return;
    setSavingAdaptive(true);
    try {
      await api(`/billetterie/projects/${projectId}/adaptive-extension`, {
        method: 'POST', body: JSON.stringify({ reason: adaptiveReason }),
      });
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
      setAdaptiveReason('');
    } finally {
      setSavingAdaptive(false);
    }
  }

  // Health R/A/G
  const [healthStatus, setHealthStatus] = useState<'R' | 'A' | 'G' | ''>(project.healthStatus ?? '');
  const [healthNotes, setHealthNotes] = useState(project.healthNotes ?? '');
  const [savingHealth, setSavingHealth] = useState(false);

  async function saveHealth() {
    if (!healthStatus) return;
    setSavingHealth(true);
    try {
      await api(`/billetterie/projects/${projectId}/health`, {
        method: 'PATCH', body: JSON.stringify({ healthStatus, healthNotes: healthNotes || null }),
      });
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
    } finally {
      setSavingHealth(false);
    }
  }

  // Lessons Learned
  const [llForm, setLlForm] = useState({
    whatWentWell: project.llWhatWentWell ?? '',
    whatDidnt: project.llWhatDidnt ?? '',
    recommendations: project.llRecommendations ?? '',
  });
  const [savingLL, setSavingLL] = useState(false);
  const [llSaved, setLlSaved] = useState(false);
  const [savingLLAck, setSavingLLAck] = useState(false);

  async function submitLL() {
    if (!llForm.whatWentWell || !llForm.whatDidnt || !llForm.recommendations) return;
    setSavingLL(true);
    try {
      await api(`/billetterie/projects/${projectId}/lessons-learned`, {
        method: 'POST', body: JSON.stringify(llForm),
      });
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
      setLlSaved(true);
      setTimeout(() => setLlSaved(false), 2500);
    } finally {
      setSavingLL(false);
    }
  }

  async function acknowledgeLL() {
    if (!confirm('Acknowledge Lessons Learned? This confirms you have reviewed and accepted the document.')) return;
    setSavingLLAck(true);
    try {
      await api(`/billetterie/projects/${projectId}/lessons-learned/acknowledge`, { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
    } finally {
      setSavingLLAck(false);
    }
  }

  // Client invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ clientName: '', clientEmail: '', expiresInDays: '30' });
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const { data: tokensData, refetch: refetchTokens } = useQuery({
    queryKey: ['bil-client-tokens', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/client-tokens`),
  });
  const tokens: any[] = tokensData?.data ?? [];

  async function saveProject() {
    setSaving(true);
    try {
      await api(`/billetterie/projects/${projectId}`, {
        method: 'PUT', body: JSON.stringify({
          ...form,
          budget: form.budget ? Number(form.budget) : null,
          projectType: form.projectType || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function sendInvite() {
    setInviting(true);
    try {
      const res = await api<{ data: any }>(`/billetterie/projects/${projectId}/client-invite`, {
        method: 'POST',
        body: JSON.stringify({
          clientName: inviteForm.clientName,
          clientEmail: inviteForm.clientEmail,
          expiresInDays: Number(inviteForm.expiresInDays),
          permissions: { viewPhases: true, viewTasks: true, viewIssues: true, viewTimeline: true, viewMeetings: true, approveDeliverables: false },
        }),
      });
      const token = res?.data?.token;
      if (token) setInviteLink(`${window.location.origin}/billetterie/client/${token}`);
      setShowInvite(false);
      setInviteForm({ clientName: '', clientEmail: '', expiresInDays: '30' });
      refetchTokens();
    } finally {
      setInviting(false);
    }
  }

  async function deactivateToken(tokenId: string) {
    if (!confirm('Deactivate this client link?')) return;
    await api(`/billetterie/projects/${projectId}/client-tokens/${tokenId}`, { method: 'DELETE' });
    refetchTokens();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Project settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Project Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Project Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client / Company</label>
            <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Budget (ZAR)</label>
            <input type="number" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target End Date</label>
            <input type="date" value={form.targetEndDate} onChange={(e) => setForm((f) => ({ ...f, targetEndDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project Type</label>
            <select value={form.projectType} onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Not set</option>
              <option value="ADAPTIVE">Adaptive</option>
              <option value="CORRECTIVE">Corrective</option>
              <option value="PERFECTIVE">Perfective</option>
              <option value="STRATEGIC">Strategic</option>
              <option value="GLOBAL">Global</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" id="is-adaptive" checked={form.isAdaptive}
              onChange={(e) => setForm((f) => ({ ...f, isAdaptive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            <label htmlFor="is-adaptive" className="text-sm text-gray-700 cursor-pointer">
              Adaptive project (Day-20 extension gate applies)
            </label>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
        </div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Client Contact</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
            <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
            <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={saveProject} disabled={saving || !form.name} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Adaptive Extension gate (only for adaptive projects, before approval) */}
      {project.isAdaptive && !project.adaptiveExtensionApproved && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-lg">⚠</span>
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Day-20 Adaptive Extension</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                This is an adaptive project. If development exceeds 20 days, the Sponsor must approve an extension before the project can advance to the next phase.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Extension Justification (Sponsor) *</label>
            <textarea value={adaptiveReason} onChange={e => setAdaptiveReason(e.target.value)} rows={2}
              placeholder="Explain why the additional time is required…"
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <button onClick={approveAdaptiveExtension} disabled={!adaptiveReason.trim() || savingAdaptive}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {savingAdaptive ? 'Approving…' : 'Approve Extension'}
          </button>
        </div>
      )}
      {project.isAdaptive && project.adaptiveExtensionApproved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-medium text-green-800">✓ Day-20 Adaptive Extension Approved</p>
          {project.adaptiveExtensionReason && <p className="text-xs text-green-700 mt-1">{project.adaptiveExtensionReason}</p>}
          <p className="text-xs text-green-500 mt-1">Approved on {project.adaptiveExtensionApprovedAt ? new Date(project.adaptiveExtensionApprovedAt).toLocaleDateString('en-ZA') : '—'}</p>
        </div>
      )}

      {/* Health R/A/G */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Project Health</h3>
        <p className="text-xs text-gray-500">Set the current health signal for this project. Visible in the project header.</p>
        <div className="flex gap-2">
          {(['R', 'A', 'G'] as const).map(s => (
            <button key={s} onClick={() => setHealthStatus(v => v === s ? '' : s)}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                healthStatus === s
                  ? s === 'R' ? 'bg-red-500 border-red-500 text-white' : s === 'A' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-green-500 border-green-500 text-white'
                  : 'border-gray-200 text-gray-400 hover:border-gray-400'
              }`}>
              {s === 'R' ? '🔴 Red' : s === 'A' ? '🟡 Amber' : '🟢 Green'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Health Notes</label>
          <textarea value={healthNotes} onChange={e => setHealthNotes(e.target.value)} rows={2} placeholder="Explain the current health status…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <button onClick={saveHealth} disabled={!healthStatus || savingHealth}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {savingHealth ? 'Saving…' : 'Save Health Status'}
        </button>
      </div>

      {/* Lessons Learned */}
      <div className={`border rounded-xl p-5 space-y-3 ${project.llSubmitted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Lessons Learned</h3>
            <p className="text-xs text-gray-500 mt-0.5">Required gate before the project can enter CLOSURE phase.</p>
          </div>
          {project.llSubmitted && (
            <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
              {project.llAcknowledgedBy ? '✓ Acknowledged' : 'Submitted — awaiting acknowledgement'}
            </span>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">What went well? *</label>
          <textarea value={llForm.whatWentWell} onChange={e => setLlForm(f => ({ ...f, whatWentWell: e.target.value }))} rows={3}
            disabled={project.llSubmitted} placeholder="Highlight successful aspects of the project…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none disabled:opacity-60 disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">What didn't go well? *</label>
          <textarea value={llForm.whatDidnt} onChange={e => setLlForm(f => ({ ...f, whatDidnt: e.target.value }))} rows={3}
            disabled={project.llSubmitted} placeholder="Be honest about challenges and gaps…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none disabled:opacity-60 disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Recommendations for future projects *</label>
          <textarea value={llForm.recommendations} onChange={e => setLlForm(f => ({ ...f, recommendations: e.target.value }))} rows={3}
            disabled={project.llSubmitted} placeholder="What would you do differently next time?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none disabled:opacity-60 disabled:bg-gray-50" />
        </div>
        <div className="flex gap-2">
          {!project.llSubmitted && (
            <button onClick={submitLL} disabled={!llForm.whatWentWell || !llForm.whatDidnt || !llForm.recommendations || savingLL}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
              {savingLL ? 'Submitting…' : llSaved ? 'Submitted ✓' : 'Submit Lessons Learned'}
            </button>
          )}
          {project.llSubmitted && !project.llAcknowledgedBy && (
            <button onClick={acknowledgeLL} disabled={savingLLAck}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {savingLLAck ? 'Acknowledging…' : 'Acknowledge (Sponsor)'}
            </button>
          )}
        </div>
        {project.llAcknowledgedBy && (
          <p className="text-xs text-green-700">
            Acknowledged on {project.llAcknowledgedAt ? new Date(project.llAcknowledgedAt).toLocaleDateString('en-ZA') : '—'}
          </p>
        )}
      </div>

      {/* Client portal */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Client Portal</h3>
            <p className="text-xs text-gray-500 mt-0.5">Generate a secure read-only link for clients.</p>
          </div>
          <button onClick={() => setShowInvite(!showInvite)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
            + New Link
          </button>
        </div>

        {inviteLink && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-green-700">Client link generated:</p>
            <p className="text-xs font-mono text-green-800 break-all">{inviteLink}</p>
            <button onClick={() => { navigator.clipboard.writeText(inviteLink); }} className="text-xs text-blue-600 hover:underline">Copy to clipboard</button>
          </div>
        )}

        {showInvite && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Invite Client</h4>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Client name *" value={inviteForm.clientName} onChange={(e) => setInviteForm((f) => ({ ...f, clientName: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input type="email" placeholder="Client email *" value={inviteForm.clientEmail} onChange={(e) => setInviteForm((f) => ({ ...f, clientEmail: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Expires in (days)</label>
                <input type="number" value={inviteForm.expiresInDays} onChange={(e) => setInviteForm((f) => ({ ...f, expiresInDays: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={sendInvite} disabled={!inviteForm.clientName || !inviteForm.clientEmail || inviting} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
                {inviting ? 'Generating...' : 'Generate Link'}
              </button>
              <button onClick={() => setShowInvite(false)} className="px-4 border border-gray-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {tokens.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Links</p>
            {tokens.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{t.clientName}</p>
                  <p className="text-xs text-gray-500">{t.clientEmail} · Expires {new Date(t.expiresAt).toLocaleDateString('en-ZA')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
                {t.isActive && (
                  <button onClick={() => deactivateToken(t.id)} className="text-xs text-red-500 hover:text-red-700">Deactivate</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overview view ────────────────────────────────────────────────────────────

function OverviewView({ projectId, project, phaseMap, onAdvance, advancing }: {
  projectId: string; project: any; phaseMap: Map<string, any>; onAdvance: () => void; advancing: boolean;
}) {
  const { data: statsData } = useQuery({
    queryKey: ['bil-overview-stats', projectId],
    queryFn: () => api<{ data: any }>(`/billetterie/projects/${projectId}/overview-stats`),
  });
  const stats = statsData?.data ?? {};

  const { data: teamData } = useQuery({
    queryKey: ['bil-team', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });
  const teamMembers: any[] = teamData?.data ?? [];

  const { data: milestonesData } = useQuery({
    queryKey: ['bil-milestones', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/milestones`),
  });
  const milestones: any[] = milestonesData?.data ?? [];
  const nextMilestone = milestones.find((m: any) => m.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.openIssues ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Issues</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.tasksDone ?? 0}/{stats.tasksTotal ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Tasks Done</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.weekHours != null ? `${Number(stats.weekHours).toFixed(1)}h` : '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">Hours This Week</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-sm font-bold text-gray-900 truncate">{nextMilestone?.title ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{nextMilestone ? `Due ${nextMilestone.dueDate ?? 'TBD'}` : 'No upcoming milestones'}</p>
        </div>
      </div>

      {/* Phase stepper + panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Project Lifecycle</h3>
        <PhaseStepper currentPhase={project.currentPhase} phaseMap={phaseMap} />
      </div>

      <PhasePanel
        projectId={projectId}
        currentPhase={project.currentPhase}
        phaseMap={phaseMap}
        onAdvance={onAdvance}
        advancing={advancing}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team mini-view */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Project Team</h3>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-gray-400">No team members assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {teamMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(m.name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEAM_ROLE_BADGE[m.role]}`}>{TEAM_ROLE_LABEL[m.role]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Details</h3>
          <div className="space-y-2 text-sm">
            {project.description && <p className="text-gray-600">{project.description}</p>}
            {project.contactName && (
              <div className="pt-2 border-t border-gray-100 space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Client Contact</p>
                <p><span className="text-gray-500">Name:</span> <span className="font-medium">{project.contactName}</span></p>
                {project.contactEmail && <p><span className="text-gray-500">Email:</span> <span className="font-medium">{project.contactEmail}</span></p>}
                {project.contactPhone && <p><span className="text-gray-500">Phone:</span> <span className="font-medium">{project.contactPhone}</span></p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <BilletterieActivityFeed projectId={projectId} />
      </div>
    </div>
  );
}

// ─── Documents view ──────────────────────────────────────────────────────────

function DocumentsView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState('');
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bil-documents', projectId, phaseFilter],
    queryFn: () => {
      const params = phaseFilter ? `?phaseKey=${phaseFilter}` : '';
      return api<{ data: any[] }>(`/billetterie/projects/${projectId}/documents${params}`);
    },
  });
  const docs = data?.data ?? [];

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', uploadName || selectedFile.name);
      if (phaseFilter) formData.append('phaseKey', phaseFilter);

      const res = await fetch(`/api/billetterie/projects/${projectId}/documents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).message || 'Upload failed');
      }
      queryClient.invalidateQueries({ queryKey: ['bil-documents', projectId] });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadName('');
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await api(`/billetterie/projects/${projectId}/documents/${docId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['bil-documents', projectId] });
  }

  function fileIcon(mime: string) {
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
    if (mime.includes('image')) return '🖼';
    if (mime.includes('zip')) return '📦';
    return '📎';
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Phases</option>
            {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          ↑ Upload Document
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={handleUpload} className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-blue-900">Upload Document</h4>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <input
            type="file"
            required
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
          />
          {selectedFile && (
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder={selectedFile.name}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!selectedFile || uploading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadName(''); setError(''); }} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">Max 25 MB. PDF, Word, Excel, PowerPoint, images, CSV, ZIP supported.</p>
        </form>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          No documents uploaded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors">
              <span className="text-xl flex-shrink-0">{fileIcon(doc.mimeType)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                <p className="text-xs text-gray-400">
                  {doc.fileName} · {formatSize(doc.fileSize)}
                  {doc.phaseKey && ` · ${doc.phaseKey.replace(/_/g, ' ')}`}
                  {' · '}{new Date(doc.uploadedAt).toLocaleDateString('en-ZA')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`/api/billetterie/projects/${projectId}/documents/${doc.id}/download`}
                  download={doc.fileName}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  Download
                </a>
                <button
                  onClick={() => handleDelete(doc.id, doc.name)}
                  className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Planning view ────────────────────────────────────────────────────────────

function TaskTimeLogForm({
  projectId,
  taskId,
  taskTitle,
  onClose,
}: {
  projectId: string;
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ workDate: new Date().toISOString().slice(0, 10), hours: '', description: '' });
  const [error, setError] = useState('');

  const logMutation = useMutation({
    mutationFn: (body: object) =>
      api(`/billetterie/projects/${projectId}/tasks/${taskId}/log-time`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bil-planning-tasks', projectId] });
      onClose();
    },
    onError: (err: any) => setError(err.message || 'Failed to log time'),
  });

  function submit() {
    const h = parseFloat(form.hours);
    if (!form.workDate || isNaN(h) || h <= 0 || h > 24) {
      setError('Enter a valid date and hours (0.25 – 24)');
      return;
    }
    logMutation.mutate({ workDate: form.workDate, hours: h, description: form.description || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Log Time</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[220px]">{taskTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input
              type="date"
              value={form.workDate}
              onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              placeholder="e.g. 2.5"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input
            placeholder="What did you work on?"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={logMutation.isPending}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {logMutation.isPending ? 'Logging…' : 'Log Time'}
          </button>
          <button onClick={onClose} className="px-4 border border-gray-300 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

const TASK_STATUS_BADGE_SMALL: Record<string, string> = {
  TODO:        'bg-gray-100 text-gray-500',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  REVIEW:      'bg-amber-50 text-amber-700',
  DONE:        'bg-green-50 text-green-700',
  CANCELLED:   'bg-red-50 text-red-500',
};

function PlanningView({ projectId, currentPhase }: { projectId: string; currentPhase: string }) {
  const [activePhase, setActivePhase] = useState<PhaseKey>(currentPhase as PhaseKey);
  const [loggingTask, setLoggingTask] = useState<{ id: string; title: string } | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', estimatedHours: '' });
  const queryClient = useQueryClient();

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['bil-planning-tasks', projectId, activePhase],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/tasks?phaseKey=${activePhase}&limit=100`),
  });
  const tasks = tasksData?.data ?? [];

  const { data: teamData } = useQuery({
    queryKey: ['bil-team', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });
  const teamMembers: any[] = teamData?.data ?? [];

  const createTaskMutation = useMutation({
    mutationFn: (body: object) =>
      api(`/billetterie/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bil-planning-tasks', projectId] });
      setAddingTask(false);
      setNewTask({ title: '', estimatedHours: '' });
    },
  });

  const currentPhaseIdx = PHASE_IDX[currentPhase as PhaseKey] ?? 0;

  return (
    <div className="space-y-8">
      {/* ── Section 1: Team ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Team</h3>
        <BilletterieTeamPanel projectId={projectId} />
      </div>

      {/* ── Section 2: Phase Deliverables ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Deliverables</h3>
          <p className="text-xs text-gray-400">Define what must be completed per phase</p>
        </div>

        {/* Phase selector */}
        <div className="flex gap-1 flex-wrap mb-5">
          {PHASES.map((phase, idx) => {
            const isDone = idx < currentPhaseIdx;
            const isCurrent = idx === currentPhaseIdx;
            const cl = CLR[phase.color];
            return (
              <button
                key={phase.key}
                onClick={() => setActivePhase(phase.key as PhaseKey)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activePhase === phase.key
                    ? cl.badge
                    : isDone
                    ? 'bg-green-50 text-green-700'
                    : idx > currentPhaseIdx
                    ? 'bg-gray-50 text-gray-400'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {isDone ? '✓ ' : ''}{phase.label}
                {isCurrent && <span className="ml-1 text-[9px] opacity-70">(active)</span>}
              </button>
            );
          })}
        </div>

        <PhaseDeliverables
          projectId={projectId}
          phaseKey={activePhase}
          phaseStatus={
            PHASE_IDX[activePhase] < currentPhaseIdx
              ? 'APPROVED'
              : PHASE_IDX[activePhase] === currentPhaseIdx
              ? 'ACTIVE'
              : 'LOCKED'
          }
          canEdit={PHASE_IDX[activePhase] >= currentPhaseIdx}
        />
      </div>

      {/* ── Section 3: Tasks ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Tasks</h3>
            {/* Phase filter pills */}
            <div className="flex gap-1 flex-wrap">
              {PHASES.map((phase, idx) => (
                <button
                  key={phase.key}
                  onClick={() => setActivePhase(phase.key as PhaseKey)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    activePhase === phase.key
                      ? CLR[phase.color].badge
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {phase.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setAddingTask(true)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            + Add Task
          </button>
        </div>

        {/* Add task inline form */}
        {addingTask && (
          <div className="mb-4 border border-dashed border-blue-300 rounded-lg p-3 bg-blue-50/40 space-y-2">
            <input
              autoFocus
              placeholder="Task title *"
              value={newTask.title}
              onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="Estimated hours"
                value={newTask.estimatedHours}
                onChange={(e) => setNewTask((f) => ({ ...f, estimatedHours: e.target.value }))}
                className="w-36 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  if (!newTask.title.trim()) return;
                  createTaskMutation.mutate({
                    title: newTask.title.trim(),
                    phaseKey: activePhase,
                    status: 'TODO',
                    estimatedHours: newTask.estimatedHours ? Number(newTask.estimatedHours) : null,
                  });
                }}
                disabled={!newTask.title.trim() || createTaskMutation.isPending}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createTaskMutation.isPending ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => { setAddingTask(false); setNewTask({ title: '', estimatedHours: '' }); }}
                className="text-xs text-gray-500 px-3 py-1.5 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Task table */}
        {tasksLoading ? (
          <p className="text-sm text-gray-400 text-center py-6">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
            No tasks for {PHASES.find((p) => p.key === activePhase)?.label ?? activePhase} yet.
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Assignee</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Est / Logged</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task: any) => (
                  <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-gray-400 truncate max-w-xs">{task.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_STATUS_BADGE_SMALL[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {task.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {task.assignee?.name ?? <span className="text-gray-300 italic">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                      {task.estimatedHours != null ? `${Number(task.estimatedHours).toFixed(1)} h est` : '—'}
                      {task.loggedHours > 0 && (
                        <span className="ml-1 text-blue-600">{` / ${Number(task.loggedHours).toFixed(1)} h logged`}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setLoggingTask({ id: task.id, title: task.title })}
                        className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-md font-medium transition-colors"
                      >
                        ⏱ Log Time
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Use the Board view for Kanban drag-drop, or Timeline for Gantt scheduling.
        </p>
      </div>

      {/* Task time log modal */}
      {loggingTask && (
        <TaskTimeLogForm
          projectId={projectId}
          taskId={loggingTask.id}
          taskTitle={loggingTask.title}
          onClose={() => setLoggingTask(null)}
        />
      )}
    </div>
  );
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'overview',    label: 'Overview',    icon: '⊞' },
  { key: 'planning',    label: 'Planning',    icon: '◈' },
  { key: 'board',       label: 'Board',       icon: '▦' },
  { key: 'timeline',    label: 'Timeline',    icon: '▬' },
  { key: 'sprints',     label: 'Sprints',     icon: '🏃' },
  { key: 'raci',        label: 'RACI',        icon: '📋' },
  { key: 'risks',       label: 'Risks',       icon: '⚠' },
  { key: 'issues',      label: 'Issues',      icon: '🐛' },
  { key: 'support',     label: 'Support',     icon: '🎟' },
  { key: 'changes',     label: 'Changes',     icon: '🔄' },
  { key: 'testing',     label: 'Testing',     icon: '🧪' },
  { key: 'timesheets',  label: 'Timesheets',  icon: '⏱' },
  { key: 'documents',   label: 'Documents',   icon: '📎' },
  { key: 'meetings',    label: 'Meetings',    icon: '◎' },
  { key: 'reports',     label: 'Reports',     icon: '📊' },
  { key: 'settings',    label: 'Settings',    icon: '⚙' },
] as const;

type NavView = typeof NAV_ITEMS[number]['key'];

// ─── Main component ───────────────────────────────────────────────────────────

export function BilletterieProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const view = (searchParams.get('view') ?? 'overview') as NavView;

  function setView(v: NavView) {
    setSearchParams({ view: v }, { replace: true });
  }

  const { data, isLoading } = useQuery({
    queryKey: ['billetterie-project', id],
    queryFn: () => api<{ data: any }>(`/billetterie/projects/${id}`),
    enabled: !!id,
  });

  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const advanceMutation = useMutation({
    mutationFn: () => api(`/billetterie/projects/${id}/phases/advance`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billetterie-project', id] });
      setAdvanceError(null);
    },
    onError: (err: any) => {
      const msg: string = err.message || '';
      if (msg.includes('Lessons Learned')) {
        setAdvanceError('Phase cannot advance: Lessons Learned must be submitted and acknowledged. Go to Settings → Lessons Learned.');
      } else if (msg.includes('adaptive')) {
        setAdvanceError('Phase cannot advance: Day-20 Adaptive Extension must be approved by the Sponsor. Go to Settings → Adaptive Extension.');
      } else {
        setAdvanceError(msg || 'Cannot advance phase. Complete all required deliverables first.');
      }
    },
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>;

  const project = data?.data;
  if (!project) return <div className="p-8 text-gray-500">Project not found.</div>;

  const phases: any[] = project.phases ?? [];
  const phaseMap = new Map(phases.map((p: any) => [p.phaseKey, p]));

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={project.name}
        subtitle={`${project.number ?? ''}${project.client ? ` — ${project.client}` : ''}`}
        backTo={{ label: 'Projects', href: '/billetterie/projects' }}
        action={
          <div className="flex items-center gap-2">
            {project.healthStatus && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                project.healthStatus === 'R' ? 'bg-red-100 text-red-800' :
                project.healthStatus === 'A' ? 'bg-amber-100 text-amber-800' :
                'bg-green-100 text-green-800'
              }`} title={project.healthNotes ?? ''}>
                <span className={`h-2 w-2 rounded-full ${project.healthStatus === 'R' ? 'bg-red-500' : project.healthStatus === 'A' ? 'bg-amber-500' : 'bg-green-500'}`} />
                {project.healthStatus === 'R' ? 'Red' : project.healthStatus === 'A' ? 'Amber' : 'Green'}
              </span>
            )}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${PROJECT_STATUS_BADGE[project.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {project.status}
            </span>
          </div>
        }
      />

      {/* Metric strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Phase</p>
          <p className="mt-1 text-sm font-bold text-blue-700">{project.currentPhase?.replace(/_/g, ' ')}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Budget</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {project.budget ? `R ${Number(project.budget).toLocaleString('en-ZA')}` : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Start Date</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {project.startDate ? new Date(project.startDate).toLocaleDateString('en-ZA') : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase">Target End</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {project.targetEndDate ? new Date(project.targetEndDate).toLocaleDateString('en-ZA') : '—'}
          </p>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex gap-6">
        {/* Left nav sidebar */}
        <nav className="w-44 flex-shrink-0">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => setView(item.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${view === item.key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          {/* Team mini-list in sidebar */}
          <TeamMiniSidebar projectId={id!} />
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {view === 'overview' && (
            <>
              {advanceError && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start justify-between gap-3">
                  <span>{advanceError}{' '}
                    {(advanceError.includes('Lessons Learned') || advanceError.includes('Adaptive')) && (
                      <button onClick={() => setView('settings')} className="underline text-amber-700 font-medium">Go to Settings →</button>
                    )}
                  </span>
                  <button onClick={() => setAdvanceError(null)} className="text-amber-600 hover:text-amber-800 flex-shrink-0">×</button>
                </div>
              )}
              <OverviewView
                projectId={id!}
                project={project}
                phaseMap={phaseMap}
                onAdvance={() => advanceMutation.mutate()}
                advancing={advanceMutation.isPending}
              />
            </>
          )}
          {view === 'planning'   && <PlanningView projectId={id!} currentPhase={project.currentPhase} />}
          {view === 'board'      && <BilletterieKanban       projectId={id!} />}
          {view === 'timeline'   && <BilletterieTimeline     projectId={id!} projectStartDate={project.startDate} projectTargetEndDate={project.targetEndDate} />}
          {view === 'sprints'    && <BilletterieSprints      projectId={id!} />}
          {view === 'raci'       && <BilletterieRaciMatrix   projectId={id!} />}
          {view === 'risks'      && <BilletterieRiskMatrix   projectId={id!} />}
          {view === 'issues'     && <BilletterieIssueList    projectId={id!} />}
          {view === 'support'    && <BilletterieSupport         projectId={id!} />}
          {view === 'changes'    && <BilletterieChangeRequests projectId={id!} />}
          {view === 'testing'    && <BilletterieTesting        projectId={id!} />}
          {view === 'timesheets' && <BilletterieTimesheetGrid  projectId={id!} />}
          {view === 'documents'  && <DocumentsView            projectId={id!} />}
          {view === 'meetings'   && <MeetingsPanel            projectId={id!} />}
          {view === 'reports'    && <BilletterieReports       projectId={id!} projectNumber={project.number ?? ''} />}
          {view === 'settings'   && <SettingsView             projectId={id!} project={project} />}
        </div>
      </div>
    </div>
  );
}

// ─── Team mini sidebar helper ─────────────────────────────────────────────────

function TeamMiniSidebar({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ['bil-team', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });
  const members: any[] = data?.data ?? [];
  if (members.length === 0) return null;

  return (
    <div className="mt-6 px-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-2">Team</p>
      <div className="space-y-1.5">
        {members.map((m: any) => (
          <div key={m.id} className="flex items-center gap-2 px-2">
            <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
              {getInitials(m.name ?? '?')}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{m.name?.split(' ')[0]}</p>
              <p className="text-[9px] text-gray-400">{TEAM_ROLE_LABEL[m.role]?.split(' ').pop()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
