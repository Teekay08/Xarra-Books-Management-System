import { useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface Milestone {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
}

interface BudgetLine {
  id: string;
  milestoneId: string | null;
  category: string;
  costClassification: string;
  customCategory: string | null;
  description: string;
  sourceType: string;
  estimatedHours: string | null;
  hourlyRate: string | null;
  estimatedAmount: string;
  externalQuote: string | null;
  milestone?: { name: string } | null;
  rateCard?: { name: string } | null;
  contractor?: { name: string } | null;
}

interface ActualCost {
  id: string;
  category: string;
  costClassification: string;
  description: string;
  sourceType: string;
  amount: string;
  vendor: string | null;
  paidDate: string | null;
  milestone?: { name: string } | null;
  budgetLineItem?: { description: string } | null;
}

interface Project {
  id: string;
  number: string;
  name: string;
  status: string;
  projectType: string;
  contractType: string;
  authorContribution: string;
  totalBudget: string;
  totalActual: string;
  xarraNetBudget: string;
  description: string | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  title?: { title: string; isbn13?: string } | null;
  author?: { legalName: string; penName?: string } | null;
  manager?: { name: string } | null;
  milestones: Milestone[];
  budgetLineItems: BudgetLine[];
  actualCostEntries: ActualCost[];
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  BUDGETED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const milestoneStatusColors: Record<string, string> = {
  NOT_STARTED: 'bg-gray-200 text-gray-600',
  IN_PROGRESS: 'bg-yellow-200 text-yellow-800',
  COMPLETED: 'bg-green-200 text-green-800',
  CANCELLED: 'bg-red-200 text-red-800',
};

const classificationColors: Record<string, string> = {
  PUBLISHING: 'bg-indigo-100 text-indigo-700',
  OPERATIONAL: 'bg-gray-100 text-gray-700',
  LAUNCH: 'bg-purple-100 text-purple-700',
  MARKETING: 'bg-pink-100 text-pink-700',
};

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromPM = searchParams.get('from') === 'pm';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'budget' | 'actuals' | 'variance' | 'estimate'>('overview');
  const [showAddLine, setShowAddLine] = useState(false);
  const [showAddActual, setShowAddActual] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['budgeting-project', id],
    queryFn: () => api<{ data: Project }>(`/budgeting/projects/${id}`),
  });

  const { data: varianceData } = useQuery({
    queryKey: ['budgeting-variance', id],
    queryFn: () => api<{ data: any }>(`/budgeting/projects/${id}/variance`),
    enabled: activeTab === 'variance',
  });

  const statusMutation = useMutation({
    mutationFn: (action: string) => api(`/budgeting/projects/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => { setError(''); queryClient.invalidateQueries({ queryKey: ['budgeting-project', id] }); },
    onError: (err: Error) => setError(err.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => api(`/budgeting/projects/${id}/email`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: emailTo, message: emailMsg }),
    }),
    onSuccess: () => { setShowEmailModal(false); setEmailTo(''); setEmailMsg(''); },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/budgeting/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-projects'] });
      navigate('/budgeting/projects');
    },
    onError: (err: Error) => { setShowDeleteModal(false); setError(err.message); },
  });

  const project = data?.data;
  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!project) return <div className="p-8 text-gray-500">Project not found.</div>;

  const budget = Number(project.totalBudget);
  const actual = Number(project.totalActual);
  const variance = budget - actual;
  const authorContrib = Number(project.authorContribution);
  const xarraNet = Number(project.xarraNetBudget);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: `Budget (${project.budgetLineItems.length})` },
    { key: 'actuals', label: `Actuals (${project.actualCostEntries.length})` },
    { key: 'variance', label: 'Variance' },
    { key: 'estimate', label: 'AI Estimate' },
  ] as const;

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={`${project.number} — ${project.projectType.replace(/_/g, ' ')} — ${project.contractType}`}
        backTo={{ label: 'Projects', href: fromPM ? '/pm/projects' : '/budgeting/projects' }}
        action={
          <div className="flex gap-2 flex-wrap">
            {project.status === 'PLANNING' && (
              <button onClick={() => statusMutation.mutate('submit-budget')}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Submit Budget
              </button>
            )}
            {project.status === 'BUDGETED' && (
              <button onClick={() => statusMutation.mutate('approve-budget')}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
                Approve & Start
              </button>
            )}
            {project.status === 'IN_PROGRESS' && (
              <button onClick={() => { if (confirm('Mark this project as completed?')) statusMutation.mutate('complete'); }}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
                Complete Project
              </button>
            )}
            <Link to={`/pm/projects/${id}/team`}
              className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
              Team
            </Link>
            <Link to={`/pm/projects/${id}/tasks`}
              className="rounded-md border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100">
              Tasks
            </Link>
            <a href={`/api/v1/budgeting/projects/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Download PDF
            </a>
            <button onClick={() => setShowEmailModal(true)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Email Report
            </button>
            <Link to={`/budgeting/projects/${id}/edit`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Edit
            </Link>
            {project.status === 'PLANNING' && (
              <button onClick={() => setShowDeleteModal(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                Delete
              </button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Status</p>
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[project.status]}`}>
            {project.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Budget</p>
          <p className="mt-1 text-lg font-bold text-gray-900">R {budget.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Actual</p>
          <p className="mt-1 text-lg font-bold text-gray-900">R {actual.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Variance</p>
          <p className={`mt-1 text-lg font-bold ${variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {variance >= 0 ? '' : '-'}R {Math.abs(variance).toFixed(2)}
          </p>
        </div>
        {project.contractType === 'HYBRID' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Xarra Net</p>
            <p className="mt-1 text-lg font-bold text-gray-900">R {xarraNet.toFixed(2)}</p>
            <p className="text-xs text-gray-400">Author: R {authorContrib.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Project Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Author</span>
            <p className="font-medium">{project.author?.penName || project.author?.legalName || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Title</span>
            <p className="font-medium">{project.title?.title || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Project Manager</span>
            <p className="font-medium">{project.manager?.name || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Timeline</span>
            <p className="font-medium">
              {project.startDate ? new Date(project.startDate).toLocaleDateString('en-ZA') : '—'}
              {' → '}
              {project.targetCompletionDate ? new Date(project.targetCompletionDate).toLocaleDateString('en-ZA') : '—'}
            </p>
          </div>
        </div>
        {project.description && (
          <p className="mt-3 text-sm text-gray-600">{project.description}</p>
        )}
      </div>

      {/* Milestone Pipeline */}
      {project.milestones.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Milestone Pipeline</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {project.milestones.map((m) => (
              <div key={m.id} className={`flex-shrink-0 rounded-lg px-4 py-2 text-xs font-medium ${milestoneStatusColors[m.status]}`}>
                <p className="font-semibold">{m.name}</p>
                <p className="opacity-70">{m.status.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-green-700 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Budget by Classification */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Budget by Classification</h3>
            {(['PUBLISHING', 'OPERATIONAL', 'LAUNCH', 'MARKETING'] as const).map((cls) => {
              const lines = project.budgetLineItems.filter((l) => l.costClassification === cls);
              const total = lines.reduce((sum, l) => sum + Number(l.estimatedAmount), 0);
              if (total === 0) return null;
              return (
                <div key={cls} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classificationColors[cls]}`}>
                    {cls}
                  </span>
                  <span className="text-sm font-medium text-gray-900">R {total.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <BudgetTab
          projectId={project.id}
          lines={project.budgetLineItems}
          milestones={project.milestones}
          showAddLine={showAddLine}
          setShowAddLine={setShowAddLine}
          queryClient={queryClient}
        />
      )}

      {/* Actuals Tab */}
      {activeTab === 'actuals' && (
        <ActualsTab
          projectId={project.id}
          actuals={project.actualCostEntries}
          milestones={project.milestones}
          budgetLines={project.budgetLineItems}
          showAddActual={showAddActual}
          setShowAddActual={setShowAddActual}
          queryClient={queryClient}
        />
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Email Budget Report</h3>
            <input type="email" placeholder="Recipient email *" value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3" />
            <textarea placeholder="Optional message" rows={3} value={emailMsg}
              onChange={(e) => setEmailMsg(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEmailModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => emailMutation.mutate()} disabled={!emailTo || emailMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {emailMutation.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-600 mb-1">
              Are you sure you want to delete <strong>{project.name}</strong>?
            </p>
            <p className="text-sm text-red-600 mb-4">
              This will permanently remove the project and all its milestones, budget lines, and actuals. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variance Tab */}
      {activeTab === 'variance' && varianceData && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Estimated</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {varianceData.data.lineVariance?.map((v: any) => {
                const vNum = Number(v.variance);
                return (
                  <tr key={v.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{v.description}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classificationColors[v.classification] || ''}`}>
                        {v.classification}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">R {Number(v.estimated).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-right">R {Number(v.actual).toFixed(2)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${vNum >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {vNum >= 0 ? '' : '-'}R {Math.abs(vNum).toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right ${vNum >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {v.variancePercent}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Estimation Tab */}
      {activeTab === 'estimate' && (
        <AiEstimationPanel projectId={project.id} milestones={project.milestones} queryClient={queryClient} />
      )}
    </div>
  );
}

// ==========================================
// AI ESTIMATION PANEL
// ==========================================

function AiEstimationPanel({ projectId, milestones, queryClient }: {
  projectId: string; milestones: Milestone[]; queryClient: any;
}) {
  const [pageCount, setPageCount] = useState(200);
  const [complexity, setComplexity] = useState(3);
  const [estimates, setEstimates] = useState<any>(null);

  const estimateMutation = useMutation({
    mutationFn: () => api<{ data: any }>(`/budgeting/projects/${projectId}/estimate`, {
      method: 'POST',
      body: JSON.stringify({ pageCount, complexityScore: complexity }),
    }),
    onSuccess: (data) => setEstimates(data.data),
    onError: (err: Error) => alert(`Estimation failed: ${err.message}`),
  });

  const applyMutation = useMutation({
    mutationFn: (items: any[]) => api(`/budgeting/projects/${projectId}/apply-estimates`, {
      method: 'POST',
      body: JSON.stringify({ estimates: items }),
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project', projectId] });
      setEstimates(null);
    },
    onError: (err: Error) => alert(`Failed to apply estimates: ${err.message}`),
  });

  const handleApply = () => {
    if (!estimates) return;
    const items = estimates.estimates
      .filter((e: any) => e.internal || e.external)
      .map((e: any) => {
        const chosen = e.recommendation === 'EXTERNAL' && e.external ? e.external : e.internal;
        return {
          milestoneId: e.milestoneId,
          estimatedHours: e.estimatedHours,
          hourlyRate: chosen?.hourlyRate || 0,
          estimatedAmount: chosen?.totalCost || 0,
          sourceType: e.recommendation,
          rateCardId: chosen?.rateCardId || null,
          description: `${e.milestoneName} — AI estimated`,
          category: e.milestoneCode,
        };
      })
      .filter((e: any) => e.estimatedAmount > 0);
    applyMutation.mutate(items);
  };

  const confidenceColors: Record<string, string> = {
    HIGH: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    LOW: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">AI Cost Estimation</h3>
        <p className="text-sm text-gray-500 mb-4">
          Generate cost estimates based on book metadata and historical data. The system uses baseline rates adjusted by project complexity,
          and improves accuracy over time as more projects are completed.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Page Count</label>
            <input type="number" min={1} value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Complexity (1-5)</label>
            <select value={complexity} onChange={(e) => setComplexity(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value={1}>1 — Simple</option>
              <option value={2}>2 — Below Average</option>
              <option value={3}>3 — Average</option>
              <option value={4}>4 — Above Average</option>
              <option value={5}>5 — Complex</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => estimateMutation.mutate()} disabled={estimateMutation.isPending}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {estimateMutation.isPending ? 'Estimating...' : 'Generate Estimates'}
            </button>
          </div>
        </div>
      </div>

      {estimates && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase">Est. Total Hours</p>
              <p className="text-xl font-bold">{estimates.summary.totalEstimatedHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase">Internal Cost</p>
              <p className="text-xl font-bold text-blue-700">R {estimates.summary.totalInternalCost.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase">External Cost</p>
              <p className="text-xl font-bold text-orange-600">R {estimates.summary.totalExternalCost.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Internal Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">External Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recommended</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {estimates.estimates.map((e: any) => (
                  <tr key={e.milestoneId}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.milestoneName}</td>
                    <td className="px-4 py-3 text-sm text-right">{e.estimatedHours}h</td>
                    <td className="px-4 py-3 text-sm text-right text-blue-700">
                      {e.internal ? `R ${e.internal.totalCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-orange-600">
                      {e.external ? `R ${e.external.totalCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.recommendation === 'INTERNAL' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {e.recommendation}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColors[e.confidence]}`}>
                        {e.confidence} {e.dataPoints > 0 ? `(${e.dataPoints} pts)` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={handleApply} disabled={applyMutation.isPending}
              className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {applyMutation.isPending ? 'Applying...' : 'Apply Estimates as Budget Lines'}
            </button>
            <button onClick={() => setEstimates(null)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Discard
            </button>
          </div>
        </>
      )}

      {!estimates && !estimateMutation.isPending && (
        <p className="text-sm text-gray-400 text-center py-8">
          Click "Generate Estimates" to get AI-powered cost projections for each milestone.
        </p>
      )}
    </div>
  );
}

// ==========================================
// BUDGET TAB
// ==========================================

function BudgetTab({ projectId, lines, milestones, showAddLine, setShowAddLine, queryClient }: {
  projectId: string;
  lines: BudgetLine[];
  milestones: Milestone[];
  showAddLine: boolean;
  setShowAddLine: (v: boolean) => void;
  queryClient: any;
}) {
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetLine | null>(null);
  const [form, setForm] = useState({
    milestoneId: '', category: 'EDITORIAL', costClassification: 'PUBLISHING',
    description: '', sourceType: 'INTERNAL', estimatedHours: '',
    hourlyRate: '', estimatedAmount: '', externalQuote: '', notes: '',
  });

  const addMutation = useMutation({
    mutationFn: () => api(`/budgeting/projects/${projectId}/budget-lines`, {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        milestoneId: form.milestoneId || null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        estimatedAmount: Number(form.estimatedAmount),
        externalQuote: form.externalQuote ? Number(form.externalQuote) : null,
      }),
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project', projectId] });
      setShowAddLine(false);
      setForm({ milestoneId: '', category: 'EDITORIAL', costClassification: 'PUBLISHING', description: '', sourceType: 'INTERNAL', estimatedHours: '', hourlyRate: '', estimatedAmount: '', externalQuote: '', notes: '' });
    },
    onError: (err: Error) => alert(`Failed to add budget line: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (lineId: string) => api(`/budgeting/budget-lines/${lineId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project', projectId] });
      setDeleteTarget(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; updates: Record<string, any> }) =>
      api(`/budgeting/budget-lines/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data.updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project', projectId] });
      setEditingLine(null);
    },
  });

  // Auto-calc estimatedAmount from hours * rate
  const autoCalc = () => {
    if (form.estimatedHours && form.hourlyRate) {
      setForm((f) => ({ ...f, estimatedAmount: String(Number(f.estimatedHours) * Number(f.hourlyRate)) }));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{lines.length} budget line items</p>
        <button onClick={() => setShowAddLine(!showAddLine)}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
          {showAddLine ? 'Cancel' : 'Add Budget Line'}
        </button>
      </div>

      {showAddLine && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <select value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">No milestone</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={form.costClassification} onChange={(e) => setForm({ ...form, costClassification: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="PUBLISHING">Publishing</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="LAUNCH">Launch</option>
              <option value="MARKETING">Marketing</option>
            </select>
            <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <input placeholder="Description *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input type="number" placeholder="Est. hours" value={form.estimatedHours}
              onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
              onBlur={autoCalc}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" placeholder="Hourly rate (R)" value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              onBlur={autoCalc}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" placeholder="Amount (R) *" value={form.estimatedAmount}
              onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" placeholder="Ext. quote (R)" value={form.externalQuote}
              onChange={(e) => setForm({ ...form, externalQuote: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button onClick={() => addMutation.mutate()} disabled={!form.description || !form.estimatedAmount || addMutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {addMutation.isPending ? 'Adding...' : 'Add Line'}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Classification</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ext. Quote</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 text-sm text-gray-500">{l.milestone?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{l.description}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classificationColors[l.costClassification] || ''}`}>
                    {l.costClassification}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.sourceType}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{l.estimatedHours || '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{l.hourlyRate ? `R ${Number(l.hourlyRate).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">R {Number(l.estimatedAmount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-400">{l.externalQuote ? `R ${Number(l.externalQuote).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <ActionMenu items={[
                    { label: 'Edit', onClick: () => setEditingLine(l) },
                    { label: 'Delete', onClick: () => setDeleteTarget(l), variant: 'danger' },
                  ]} />
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No budget lines yet.</td></tr>
            )}
            {lines.length > 0 && (
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={6} className="px-4 py-3 text-sm text-gray-900 text-right">Total:</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">
                  R {lines.reduce((s, l) => s + Number(l.estimatedAmount), 0).toFixed(2)}
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Budget Line Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Budget Line</h3>
            <p className="text-sm text-gray-600 mb-1">
              Are you sure you want to delete <strong>{deleteTarget.description}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Amount: R {Number(deleteTarget.estimatedAmount).toFixed(2)}
            </p>
            {deleteMutation.isError && (
              <p className="text-sm text-red-600 mb-3">{(deleteMutation.error as Error)?.message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteTarget(null); deleteMutation.reset(); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Budget Line Modal */}
      {editingLine && (
        <EditBudgetLineModal
          line={editingLine}
          milestones={milestones}
          onClose={() => setEditingLine(null)}
          onSave={(updates) => editMutation.mutate({ id: editingLine.id, updates })}
          isPending={editMutation.isPending}
        />
      )}
    </div>
  );
}

function EditBudgetLineModal({ line, milestones, onClose, onSave, isPending }: {
  line: BudgetLine;
  milestones: Milestone[];
  onClose: () => void;
  onSave: (updates: Record<string, any>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    milestoneId: line.milestoneId || '',
    category: line.category,
    costClassification: line.costClassification,
    description: line.description,
    sourceType: line.sourceType,
    estimatedHours: line.estimatedHours || '',
    hourlyRate: line.hourlyRate || '',
    estimatedAmount: line.estimatedAmount,
    externalQuote: line.externalQuote || '',
  });

  const autoCalc = () => {
    if (form.estimatedHours && form.hourlyRate) {
      setForm((f) => ({ ...f, estimatedAmount: String(Number(f.estimatedHours) * Number(f.hourlyRate)) }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Budget Line</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Milestone</label>
              <select value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">— None —</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Classification</label>
              <select value={form.costClassification} onChange={(e) => setForm({ ...form, costClassification: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="PUBLISHING">Publishing</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="LAUNCH">Launch</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="EDITORIAL">Editorial</option>
                <option value="DESIGN">Design</option>
                <option value="PRODUCTION">Production</option>
                <option value="MARKETING">Marketing</option>
                <option value="DISTRIBUTION">Distribution</option>
                <option value="ADMIN">Admin</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="INTERNAL">Internal</option>
                <option value="EXTERNAL">External</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hours</label>
              <input type="number" value={form.estimatedHours}
                onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
                onBlur={autoCalc}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rate (R)</label>
              <input type="number" value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                onBlur={autoCalc}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount (R)</label>
              <input type="number" value={form.estimatedAmount}
                onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ext. Quote</label>
              <input type="number" value={form.externalQuote}
                onChange={(e) => setForm({ ...form, externalQuote: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => onSave({
            ...form,
            milestoneId: form.milestoneId || null,
            estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
            hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
            estimatedAmount: Number(form.estimatedAmount),
            externalQuote: form.externalQuote ? Number(form.externalQuote) : null,
          })} disabled={!form.description || !form.estimatedAmount || isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ACTUALS TAB
// ==========================================

function ActualsTab({ projectId, actuals, milestones, budgetLines, showAddActual, setShowAddActual, queryClient }: {
  projectId: string;
  actuals: ActualCost[];
  milestones: Milestone[];
  budgetLines: BudgetLine[];
  showAddActual: boolean;
  setShowAddActual: (v: boolean) => void;
  queryClient: any;
}) {
  const [form, setForm] = useState({
    milestoneId: '', budgetLineItemId: '', category: 'EDITORIAL', costClassification: 'PUBLISHING',
    description: '', sourceType: 'INTERNAL', amount: '', vendor: '', invoiceRef: '', paidDate: '', notes: '',
  });

  const addMutation = useMutation({
    mutationFn: () => api(`/budgeting/projects/${projectId}/actuals`, {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        milestoneId: form.milestoneId || null,
        budgetLineItemId: form.budgetLineItemId || null,
        amount: Number(form.amount),
        paidDate: form.paidDate || null,
      }),
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgeting-project', projectId] });
      setShowAddActual(false);
      setForm({ milestoneId: '', budgetLineItemId: '', category: 'EDITORIAL', costClassification: 'PUBLISHING', description: '', sourceType: 'INTERNAL', amount: '', vendor: '', invoiceRef: '', paidDate: '', notes: '' });
    },
    onError: (err: Error) => alert(`Failed to record cost: ${err.message}`),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{actuals.length} actual cost entries</p>
        <button onClick={() => setShowAddActual(!showAddActual)}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
          {showAddActual ? 'Cancel' : 'Record Actual Cost'}
        </button>
      </div>

      {showAddActual && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <select value={form.milestoneId} onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">No milestone</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={form.budgetLineItemId} onChange={(e) => setForm({ ...form, budgetLineItemId: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Link to budget line</option>
              {budgetLines.map((l) => <option key={l.id} value={l.id}>{l.description}</option>)}
            </select>
            <select value={form.costClassification} onChange={(e) => setForm({ ...form, costClassification: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="PUBLISHING">Publishing</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="LAUNCH">Launch</option>
              <option value="MARKETING">Marketing</option>
            </select>
            <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <input placeholder="Description *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input type="number" placeholder="Amount (R) *" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input placeholder="Invoice ref" value={form.invoiceRef} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={form.paidDate} onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button onClick={() => addMutation.mutate()} disabled={!form.description || !form.amount || addMutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {addMutation.isPending ? 'Recording...' : 'Record Cost'}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Classification</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {actuals.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-sm text-gray-500">{a.milestone?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{a.description}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classificationColors[a.costClassification] || ''}`}>
                    {a.costClassification}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{a.sourceType}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{a.vendor || '—'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">R {Number(a.amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{a.paidDate ? new Date(a.paidDate).toLocaleDateString('en-ZA') : '—'}</td>
              </tr>
            ))}
            {actuals.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No actual costs recorded yet.</td></tr>
            )}
            {actuals.length > 0 && (
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-sm text-gray-900 text-right">Total:</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">
                  R {actuals.reduce((s, a) => s + Number(a.amount), 0).toFixed(2)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
