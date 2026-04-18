import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

// ─── Phase config ─────────────────────────────────────────────────────────────

const PHASES = [
  {
    key: 'INITIATION',
    label: 'Initiation',
    description: 'Project charter, scope definition, stakeholder register, kick-off meeting',
    color: 'slate',
    requiredDocs: ['Project Charter', 'Stakeholder Register', 'Kick-off Meeting Minutes'],
  },
  {
    key: 'ELICITATION',
    label: 'Elicitation',
    description: 'Requirements gathering, user stories, business process mapping',
    color: 'purple',
    requiredDocs: ['Business Requirements Document', 'User Stories / Use Cases', 'Process Diagrams'],
  },
  {
    key: 'ARCHITECTURE',
    label: 'Architecture',
    description: 'Technical design, system architecture, tech stack decisions, PoC',
    color: 'indigo',
    requiredDocs: ['System Architecture Document', 'Tech Stack Proposal', 'Architecture Review Sign-off'],
  },
  {
    key: 'DEVELOPMENT',
    label: 'Development',
    description: 'Active build phase with sprint tracking and deliverable reviews',
    color: 'blue',
    requiredDocs: ['Development Plan', 'Sprint Reports'],
  },
  {
    key: 'TESTING',
    label: 'Testing',
    description: 'UAT, bug register, test plans, regression testing',
    color: 'yellow',
    requiredDocs: ['Test Plan', 'UAT Sign-off', 'Bug Register (closed)'],
  },
  {
    key: 'SIGN_OFF',
    label: 'Sign-off',
    description: 'Client acceptance, final invoice, handover documentation',
    color: 'orange',
    requiredDocs: ['Client Acceptance Certificate', 'Handover Document', 'Final Invoice'],
  },
  {
    key: 'CLOSURE',
    label: 'Closure',
    description: 'Project retrospective, lessons learned, archive',
    color: 'green',
    requiredDocs: ['Project Closure Report', 'Lessons Learned Document'],
  },
] as const;

type PhaseKey = typeof PHASES[number]['key'];

const PHASE_INDEX: Record<string, number> = Object.fromEntries(PHASES.map((p, i) => [p.key, i]));

const PHASE_COLOR_MAP: Record<string, { dot: string; badge: string; bg: string; border: string; text: string }> = {
  slate:  { dot: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-200', text: 'text-slate-700' },
  purple: { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700' },
  indigo: { dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200',text: 'text-indigo-700' },
  blue:   { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',     bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700' },
  yellow: { dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700' },
  orange: { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-700' },
  green:  { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',   bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700' },
};

// ─── Phase stepper ────────────────────────────────────────────────────────────

function PhaseStepper({ currentPhase, phases }: { currentPhase: string; phases: any[] }) {
  const currentIdx = PHASE_INDEX[currentPhase] ?? 0;
  const phaseMap = new Map((phases ?? []).map((p: any) => [p.phaseKey, p]));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Project Lifecycle</h3>
      <div className="relative">
        {/* Connector line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
        <div className="relative flex justify-between">
          {PHASES.map((phase, idx) => {
            const phaseData = phaseMap.get(phase.key);
            const isCompleted = idx < currentIdx || phaseData?.status === 'APPROVED';
            const isCurrent = idx === currentIdx;
            const isLocked = idx > currentIdx && phaseData?.status !== 'APPROVED';
            const colors = PHASE_COLOR_MAP[phase.color];

            return (
              <div key={phase.key} className="flex flex-col items-center gap-1" style={{ width: `${100 / PHASES.length}%` }}>
                <div
                  className={`relative z-10 h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : isCurrent
                      ? `${colors.dot} border-current text-white`
                      : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span className={`text-[10px] font-medium text-center leading-tight ${isCurrent ? colors.text : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                  {phase.label}
                </span>
                {isLocked && (
                  <span className="text-[9px] text-gray-300">Locked</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Phase detail panel ───────────────────────────────────────────────────────

function PhasePanel({
  projectId,
  currentPhase,
  phases,
}: {
  projectId: string;
  currentPhase: string;
  phases: any[];
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PhaseKey>(currentPhase as PhaseKey);
  const activeIdx = PHASE_INDEX[activeTab] ?? 0;
  const currentIdx = PHASE_INDEX[currentPhase] ?? 0;
  const phaseConfig = PHASES[activeIdx];
  const colors = PHASE_COLOR_MAP[phaseConfig.color];
  const phaseMap = new Map((phases ?? []).map((p: any) => [p.phaseKey, p]));
  const phaseData = phaseMap.get(activeTab);
  const isLocked = activeIdx > currentIdx;
  const isApproved = phaseData?.status === 'APPROVED';

  const advanceMutation = useMutation({
    mutationFn: () =>
      api(`/billetterie/projects/${projectId}/phases/advance`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billetterie-project', projectId] }),
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
      {/* Phase tabs */}
      <div className="flex gap-1 flex-wrap mb-5 -mx-1">
        {PHASES.map((phase, idx) => {
          const phD = phaseMap.get(phase.key);
          const done = idx < currentIdx || phD?.status === 'APPROVED';
          const cols = PHASE_COLOR_MAP[phase.color];
          return (
            <button
              key={phase.key}
              onClick={() => setActiveTab(phase.key as PhaseKey)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === phase.key
                  ? cols.badge
                  : done
                  ? 'bg-green-50 text-green-700'
                  : idx > currentIdx
                  ? 'bg-gray-50 text-gray-400 cursor-default'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {done && idx < currentIdx ? '✓ ' : ''}{phase.label}
            </button>
          );
        })}
      </div>

      {/* Active phase content */}
      <div className={`rounded-lg border ${colors.border} ${colors.bg} p-5`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className={`text-base font-semibold ${colors.text}`}>{phaseConfig.label}</h3>
            <p className="text-sm text-gray-600 mt-1">{phaseConfig.description}</p>
          </div>
          {isLocked && (
            <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
              Locked
            </span>
          )}
          {isApproved && (
            <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Approved
            </span>
          )}
          {!isLocked && !isApproved && activeIdx === currentIdx && (
            <span className={`inline-flex rounded-full ${colors.badge} px-3 py-1 text-xs font-medium`}>
              Active
            </span>
          )}
        </div>

        {/* Required gate documents */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Gate Documents Required
          </p>
          <div className="space-y-1.5">
            {phaseConfig.requiredDocs.map((doc) => {
              const uploaded = phaseData?.gateDocuments?.some(
                (d: any) => d.name === doc && d.status === 'APPROVED',
              );
              return (
                <div key={doc} className="flex items-center gap-2">
                  <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold ${uploaded ? 'bg-green-500 text-white' : 'border border-gray-300 text-gray-300'}`}>
                    {uploaded ? '✓' : ''}
                  </span>
                  <span className={`text-sm ${uploaded ? 'text-gray-700 line-through' : 'text-gray-600'}`}>{doc}</span>
                  {!isLocked && !uploaded && (
                    <span className="text-xs text-amber-600 font-medium ml-auto">Required</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes for this phase */}
        {phaseData?.notes && (
          <div className="rounded-md bg-white/60 border border-white/80 p-3 mb-4">
            <p className="text-xs text-gray-500 font-medium mb-1">Phase Notes</p>
            <p className="text-sm text-gray-700">{phaseData.notes}</p>
          </div>
        )}

        {/* Advance phase button — only on current active phase */}
        {!isLocked && !isApproved && activeIdx === currentIdx && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {advanceMutation.isPending ? 'Advancing…' : `Complete ${phaseConfig.label} & Advance →`}
            </button>
            <p className="text-xs text-gray-500">
              Ensure all required documents are approved before advancing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function BilletterieProjectDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['billetterie-project', id],
    queryFn: () => api<{ data: any }>(`/billetterie/projects/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>;

  const project = data?.data;
  if (!project) return <div className="p-8 text-gray-500">Project not found.</div>;

  const phases = project.phases ?? [];

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={`${project.number} — ${project.client || 'Internal'}`}
        backTo={{ label: 'Projects', href: '/billetterie/projects' }}
        action={
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600'}`}>
              {project.status}
            </span>
            <Link
              to={`/billetterie/projects/${id}/edit`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
          </div>
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Current Phase</p>
          <p className="mt-1 text-sm font-bold text-blue-700">{project.currentPhase?.replace(/_/g, ' ')}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Budget</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {project.budget ? `R ${Number(project.budget).toLocaleString('en-ZA')}` : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Start Date</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {project.startDate ? new Date(project.startDate).toLocaleDateString('en-ZA') : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Target End</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {project.targetEndDate ? new Date(project.targetEndDate).toLocaleDateString('en-ZA') : '—'}
          </p>
        </div>
      </div>

      {/* Phase stepper */}
      <PhaseStepper currentPhase={project.currentPhase} phases={phases} />

      {/* Phase detail */}
      <PhasePanel projectId={id!} currentPhase={project.currentPhase} phases={phases} />

      {/* Description + Contact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Description</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{project.description || 'No description provided.'}</p>
          {project.notes && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-1">Internal Notes</p>
              <p className="text-sm text-gray-600">{project.notes}</p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Client Contact</h3>
          {project.contactName || project.contactEmail ? (
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Name:</span> <span className="font-medium">{project.contactName || '—'}</span></p>
              <p><span className="text-gray-500">Email:</span> <span className="font-medium">{project.contactEmail || '—'}</span></p>
              <p><span className="text-gray-500">Phone:</span> <span className="font-medium">{project.contactPhone || '—'}</span></p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No client contact recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
