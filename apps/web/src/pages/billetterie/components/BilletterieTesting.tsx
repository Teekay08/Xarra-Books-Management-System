import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

type PlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
type TestType   = 'FUNCTIONAL' | 'REGRESSION' | 'SMOKE' | 'PERFORMANCE' | 'SECURITY' | 'UAT' | 'OTHER';
type TestResult = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'NOT_RUN';

interface TestPlan {
  id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  testType: TestType;
  targetPhase: string | null;
  passThreshold: number;
  summary: { total: number; pass: number; fail: number; blocked: number; notRun: number; skipped: number; passPct: number };
  createdAt: string;
}

interface TestCase {
  id: string;
  planId: string;
  title: string;
  description: string | null;
  steps: Array<{ step: string; expected: string }>;
  expectedResult: string | null;
  priority: string;
  latestResult: TestResult;
  linkedIssueId: string | null;
  position: number;
}

const RESULT_STYLES: Record<TestResult, { bg: string; text: string; icon: string }> = {
  PASS:    { bg: 'bg-green-100',  text: 'text-green-800',  icon: '✓' },
  FAIL:    { bg: 'bg-red-100',    text: 'text-red-800',    icon: '✕' },
  BLOCKED: { bg: 'bg-amber-100',  text: 'text-amber-800',  icon: '⊘' },
  SKIPPED: { bg: 'bg-gray-100',   text: 'text-gray-600',   icon: '→' },
  NOT_RUN: { bg: 'bg-gray-50',    text: 'text-gray-400',   icon: '○' },
};

const STATUS_STYLES: Record<PlanStatus, string> = {
  DRAFT:     'bg-gray-100 text-gray-700',
  ACTIVE:    'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  ARCHIVED:  'bg-gray-100 text-gray-500',
};

function ProgressBar({ pass, fail, blocked, skipped, total }: { pass: number; fail: number; blocked: number; skipped: number; total: number }) {
  if (total === 0) return <div className="h-2 bg-gray-100 rounded-full" />;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
      <div className="bg-green-500 h-full" style={{ width: `${(pass / total) * 100}%` }} />
      <div className="bg-red-400 h-full"   style={{ width: `${(fail / total) * 100}%` }} />
      <div className="bg-amber-400 h-full" style={{ width: `${(blocked / total) * 100}%` }} />
      <div className="bg-gray-300 h-full"  style={{ width: `${(skipped / total) * 100}%` }} />
    </div>
  );
}

function TestCaseRow({ tc, planId, projectId, onUpdate }: {
  tc: TestCase; planId: string; projectId: string; onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [executing, setExecuting] = useState<TestResult | null>(null);
  const [notes, setNotes] = useState('');
  const r = RESULT_STYLES[tc.latestResult];

  const executeMut = useMutation({
    mutationFn: (body: { result: TestResult; notes?: string }) =>
      api(`/billetterie/projects/${projectId}/test-plans/${planId}/cases/${tc.id}/execute`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    onSuccess: () => { onUpdate(); setExecuting(null); setNotes(''); },
  });

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(e => !e)}>
        <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${r.bg} ${r.text}`}>
          {r.icon}
        </span>
        <span className="flex-1 text-sm text-gray-800">{tc.title}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          tc.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
          tc.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
          'bg-gray-100 text-gray-600'
        }`}>{tc.priority}</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          {tc.description && <p className="text-xs text-gray-600">{tc.description}</p>}

          {tc.steps.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Steps</div>
              <div className="space-y-1.5">
                {tc.steps.map((s, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white border border-gray-200 rounded px-2 py-1.5">
                      <span className="text-gray-400 font-mono">{i + 1}.</span> {s.step}
                    </div>
                    <div className="bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-500 italic">
                      Expected: {s.expected}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tc.expectedResult && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Expected Result</div>
              <p className="text-xs text-gray-700">{tc.expectedResult}</p>
            </div>
          )}

          {/* Execute buttons */}
          <div className="pt-1">
            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Record Execution</div>
            {executing ? (
              <div className="space-y-2">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder={`Notes for ${executing} result (optional)…`}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <div className="flex gap-2">
                  <button onClick={() => executeMut.mutate({ result: executing, notes: notes || undefined })}
                    disabled={executeMut.isPending}
                    className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 ${
                      executing === 'PASS' ? 'bg-green-600 hover:bg-green-700' :
                      executing === 'FAIL' ? 'bg-red-600 hover:bg-red-700' :
                      executing === 'BLOCKED' ? 'bg-amber-600 hover:bg-amber-700' :
                      'bg-gray-600 hover:bg-gray-700'
                    }`}>
                    {executeMut.isPending ? 'Saving…' : `Confirm ${executing}`}
                  </button>
                  <button onClick={() => { setExecuting(null); setNotes(''); }}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                {(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as TestResult[]).map(res => {
                  const s = RESULT_STYLES[res];
                  return (
                    <button key={res} onClick={() => setExecuting(res)}
                      className={`px-2.5 py-1 text-xs font-bold rounded border-2 transition-colors ${s.bg} ${s.text} border-transparent hover:border-current`}>
                      {s.icon} {res}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanDetail({ plan, projectId, onBack }: { plan: TestPlan; projectId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [addingCase, setAddingCase] = useState(false);
  const [caseForm, setCaseForm] = useState({ title: '', description: '', priority: 'MEDIUM', steps: [{ step: '', expected: '' }] });

  const { data: casesData, refetch } = useQuery({
    queryKey: ['bil-test-cases', plan.id],
    queryFn: () => api<{ data: TestCase[] }>(`/billetterie/projects/${projectId}/test-plans/${plan.id}/cases`),
  });

  const updatePlanMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/test-plans/${plan.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-test-plans', projectId] }),
  });

  const createCaseMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/test-plans/${plan.id}/cases`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { refetch(); setAddingCase(false); setCaseForm({ title: '', description: '', priority: 'MEDIUM', steps: [{ step: '', expected: '' }] }); },
  });

  const deleteCaseMut = useMutation({
    mutationFn: (caseId: string) => api(`/billetterie/projects/${projectId}/test-plans/${plan.id}/cases/${caseId}`, { method: 'DELETE' }),
    onSuccess: () => refetch(),
  });

  const cases: TestCase[] = casesData?.data ?? [];
  const s = plan.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">← All Plans</button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{plan.title}</span>
        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[plan.status]}`}>{plan.status}</span>
      </div>

      {/* Plan stats */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-lg font-black text-gray-900">{s.passPct}%</span>
            <span className="text-xs text-gray-500 ml-1">pass rate</span>
            {s.passPct >= plan.passThreshold
              ? <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓ Threshold met ({plan.passThreshold}%)</span>
              : <span className="ml-2 text-[10px] text-gray-400">Target: {plan.passThreshold}%</span>
            }
          </div>
          <div className="flex gap-4 text-center text-xs">
            <div><div className="font-bold text-green-600">{s.pass}</div><div className="text-gray-400">Pass</div></div>
            <div><div className="font-bold text-red-600">{s.fail}</div><div className="text-gray-400">Fail</div></div>
            <div><div className="font-bold text-amber-600">{s.blocked}</div><div className="text-gray-400">Blocked</div></div>
            <div><div className="font-bold text-gray-400">{s.notRun}</div><div className="text-gray-400">Not Run</div></div>
          </div>
          <div className="flex gap-2">
            {plan.status === 'DRAFT' && (
              <button onClick={() => updatePlanMut.mutate({ status: 'ACTIVE' })}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                Activate Plan
              </button>
            )}
            {plan.status === 'ACTIVE' && (
              <button onClick={() => updatePlanMut.mutate({ status: 'COMPLETED' })}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">
                Complete Plan
              </button>
            )}
          </div>
        </div>
        <ProgressBar pass={s.pass} fail={s.fail} blocked={s.blocked} skipped={s.skipped} total={s.total} />
      </div>

      {/* Add case */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Test Cases ({cases.length})</h3>
        <button onClick={() => setAddingCase(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
          + Add Test Case
        </button>
      </div>

      {addingCase && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-blue-900">New Test Case</h4>
          <input value={caseForm.title} onChange={e => setCaseForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Test case title *"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <textarea value={caseForm.description} onChange={e => setCaseForm(f => ({ ...f, description: e.target.value }))} rows={2}
            placeholder="Description (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1.5">Test Steps</div>
            <div className="space-y-1.5">
              {caseForm.steps.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input value={s.step} onChange={e => setCaseForm(f => ({ ...f, steps: f.steps.map((x, j) => j === i ? { ...x, step: e.target.value } : x) }))}
                    placeholder={`Step ${i + 1}`}
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  <input value={s.expected} onChange={e => setCaseForm(f => ({ ...f, steps: f.steps.map((x, j) => j === i ? { ...x, expected: e.target.value } : x) }))}
                    placeholder="Expected result"
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              ))}
              <button onClick={() => setCaseForm(f => ({ ...f, steps: [...f.steps, { step: '', expected: '' }] }))}
                className="text-xs text-blue-600 hover:underline">+ Add step</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createCaseMut.mutate({
              title: caseForm.title, description: caseForm.description || null, priority: caseForm.priority,
              steps: caseForm.steps.filter(s => s.step.trim()),
            })} disabled={!caseForm.title.trim() || createCaseMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createCaseMut.isPending ? 'Adding…' : 'Add Test Case'}
            </button>
            <button onClick={() => setAddingCase(false)} className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {cases.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-gray-400">No test cases yet. Add the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(tc => (
            <div key={tc.id} className="relative group">
              <TestCaseRow tc={tc} planId={plan.id} projectId={projectId} onUpdate={refetch} />
              <button onClick={() => { if (confirm('Delete this test case?')) deleteCaseMut.mutate(tc.id); }}
                className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 text-xs transition-opacity">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props { projectId: string }

export function BilletterieTesting({ projectId }: Props) {
  const qc = useQueryClient();
  const [activePlan, setActivePlan] = useState<TestPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', testType: 'FUNCTIONAL' as TestType, passThreshold: '80', targetPhase: '' });

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['bil-test-plans', projectId],
    queryFn: () => api<{ data: TestPlan[] }>(`/billetterie/projects/${projectId}/test-plans`),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/test-plans`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-test-plans', projectId] }); setCreating(false); setForm({ title: '', testType: 'FUNCTIONAL', passThreshold: '80', targetPhase: '' }); },
  });

  const deletePlanMut = useMutation({
    mutationFn: (planId: string) => api(`/billetterie/projects/${projectId}/test-plans/${planId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bil-test-plans', projectId] }),
  });

  const plans: TestPlan[] = plansData?.data ?? [];

  // If a plan is selected, show its detail view
  if (activePlan) {
    // Refresh from latest data
    const latestPlan = plans.find(p => p.id === activePlan.id) ?? activePlan;
    return <PlanDetail plan={latestPlan} projectId={projectId} onBack={() => setActivePlan(null)} />;
  }

  const totalCases = plans.reduce((s, p) => s + p.summary.total, 0);
  const totalPass  = plans.reduce((s, p) => s + p.summary.pass, 0);
  const totalFail  = plans.reduce((s, p) => s + p.summary.fail, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Testing</h2>
          <p className="text-xs text-gray-500 mt-0.5">Test plans, cases and execution tracking with pass/fail thresholds</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + New Test Plan
        </button>
      </div>

      {/* Summary strip */}
      {totalCases > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Test Cases', val: totalCases, color: 'text-gray-900' },
            { label: 'Passed', val: totalPass, color: 'text-green-700' },
            { label: 'Failed', val: totalFail, color: 'text-red-700' },
            { label: 'Pass Rate', val: `${totalCases > 0 ? Math.round((totalPass / totalCases) * 100) : 0}%`, color: 'text-blue-700' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <div className={`text-xl font-black ${m.color}`}>{m.val}</div>
              <div className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">New Test Plan</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Sprint 3 Regression, UAT Round 1"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Test Type</label>
              <select value={form.testType} onChange={e => setForm(f => ({ ...f, testType: e.target.value as TestType }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {(['FUNCTIONAL', 'REGRESSION', 'SMOKE', 'PERFORMANCE', 'SECURITY', 'UAT', 'OTHER'] as TestType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pass Threshold (%)</label>
              <input type="number" min={1} max={100} value={form.passThreshold}
                onChange={e => setForm(f => ({ ...f, passThreshold: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate({ title: form.title, testType: form.testType, passThreshold: Number(form.passThreshold) })}
              disabled={!form.title.trim() || createMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create Plan'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Plan list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading test plans…</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">🧪</div>
          <p className="text-sm font-medium text-gray-500">No test plans yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a test plan to start managing test cases and tracking results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const s = plan.summary;
            return (
              <div key={plan.id} className="bg-white border border-gray-200 rounded-xl p-4 group cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                onClick={() => setActivePlan(plan)}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-gray-900">{plan.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[plan.status]}`}>{plan.status}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{plan.testType}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <ProgressBar pass={s.pass} fail={s.fail} blocked={s.blocked} skipped={s.skipped} total={s.total} />
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span className="text-green-600 font-medium">{s.pass} pass</span>
                        <span className="text-red-600 font-medium">{s.fail} fail</span>
                        <span className="text-amber-600 font-medium">{s.blocked} blocked</span>
                        <span className="text-gray-400">{s.notRun} not run</span>
                        <span className="ml-auto font-bold text-gray-700">{s.passPct}% · Target {plan.passThreshold}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); if (confirm(`Delete plan "${plan.title}"?`)) deletePlanMut.mutate(plan.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 text-sm transition-opacity">✕</button>
                    <span className="text-gray-300 group-hover:text-blue-400 text-sm">›</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
