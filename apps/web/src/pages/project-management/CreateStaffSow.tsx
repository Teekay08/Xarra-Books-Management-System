import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { AiSuggestButton } from '../../components/AiSuggestButton';

export function CreateStaffSow() {
  const { staffId } = useParams();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState('');
  const [terms, setTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [deliverables, setDeliverables] = useState<Array<{ description: string; dueDate: string; acceptanceCriteria: string }>>([]);
  const [costBreakdown, setCostBreakdown] = useState<Array<{ description: string; hours: number; rate: number; total: number }>>([]);
  const [timeline, setTimeline] = useState<{ startDate: string; endDate: string; milestones: Array<{ name: string; date: string }> }>({
    startDate: '', endDate: '', milestones: [],
  });

  // Fetch pre-populated SOW data from task assignments
  const { data: sowData, isLoading } = useQuery({
    queryKey: ['pm-sow-data', projectId, staffId],
    queryFn: () => api<{ data: any }>(`/project-management/projects/${projectId}/staff/${staffId}/sow-data`),
    enabled: !!projectId && !!staffId,
  });

  // If a SOW already exists for this project + staff user, redirect to it instead.
  const { data: existingSow } = useQuery({
    queryKey: ['sow-lookup', projectId, sowData?.data?.staffUserId],
    queryFn: () =>
      api<{ data: { id: string } | null }>(
        `/budgeting/sow/lookup?projectId=${projectId}&staffUserId=${encodeURIComponent(sowData!.data!.staffUserId)}`,
      ),
    enabled: !!projectId && !!sowData?.data?.staffUserId,
  });

  useEffect(() => {
    if (existingSow?.data?.id) {
      navigate(`/budgeting/sow/${existingSow.data.id}`, { replace: true });
    }
  }, [existingSow, navigate]);

  // Pre-fill form when data loads
  useEffect(() => {
    if (sowData?.data) {
      const d = sowData.data;
      setScope(d.scope || '');
      setTerms(d.terms || '');
      setDeliverables(d.deliverables?.length ? d.deliverables : [{ description: '', dueDate: '', acceptanceCriteria: '' }]);
      setCostBreakdown(d.costBreakdown?.length ? d.costBreakdown : [{ description: '', hours: 0, rate: 0, total: 0 }]);
      setTimeline(d.timeline || { startDate: '', endDate: '', milestones: [] });
    }
  }, [sowData]);

  const totalAmount = costBreakdown.reduce((s, c) => s + c.total, 0);

  const createMutation = useMutation({
    mutationFn: () => {
      const validDeliverables = deliverables
        .map((d) => ({
          description: d.description?.trim() || '',
          dueDate: d.dueDate || new Date().toISOString(),
          acceptanceCriteria: d.acceptanceCriteria?.trim() || 'Completed to satisfaction',
        }))
        .filter((d) => d.description.length > 0);

      const validCosts = costBreakdown
        .filter((c) => c.description?.trim() && c.total > 0)
        .map((c) => ({
          description: c.description.trim(),
          hours: c.hours,
          rate: c.rate,
          total: c.total,
        }));

      return api('/budgeting/sow', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          contractorId: null,
          staffUserId: sowData?.data?.staffUserId || null,
          scope: scope.trim(),
          deliverables: validDeliverables,
          timeline,
          costBreakdown: validCosts,
          totalAmount: validCosts.reduce((s, c) => s + c.total, 0),
          terms: terms || null,
          validUntil: validUntil || null,
          notes: notes || null,
        }),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['sow-documents'] });
      navigate(`/budgeting/sow/${data?.data?.id || ''}`);
    },
    onError: (err: Error) => {
      // If backend says one already exists, refetch the lookup so the auto-redirect kicks in.
      if (/already exists/i.test(err.message)) {
        queryClient.invalidateQueries({ queryKey: ['sow-lookup', projectId] });
      }
      setError(err.message);
    },
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading SOW data from task assignments...</div>;

  const staffName = sowData?.data?.staffName || 'Staff Member';
  const projName = sowData?.data?.projectName || 'Project';

  return (
    <div>
      <PageHeader
        title={`Create SOW for ${staffName}`}
        subtitle={`Project: ${projName} (${sowData?.data?.projectNumber || ''})`}
        backTo={{ label: 'Staff Profile', href: `/pm/staff/${staffId}` }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-md bg-blue-50 border border-blue-200 p-4 mb-6 text-sm text-blue-800">
        This SOW has been pre-populated from {staffName}'s task assignments on this project.
        Review and edit as needed before creating.
      </div>

      <div className="max-w-4xl space-y-6">
        {/* Scope */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-900">Scope of Work</label>
            <AiSuggestButton
              endpoint="/ai/suggest/sow"
              payload={{
                projectName: sowData?.data?.projectName || 'Project',
                staffName: sowData?.data?.staffName || 'Staff',
                staffRole: sowData?.data?.isInternal ? 'Internal Staff' : 'Contractor',
                tasks: costBreakdown.filter((c) => c.description).map((c) => ({
                  title: c.description, hours: c.hours, rate: c.rate,
                })),
                isInternal: sowData?.data?.isInternal ?? true,
              }}
              onSuggestion={(data) => {
                if (data.scope && !scope.includes('Statement of Work')) {
                  setScope(data.scope);
                } else if (data.scope) {
                  setScope(scope + '\n\n' + data.scope);
                }
                if (data.terms && !terms) setTerms(data.terms);
              }}
              label="AI Suggest Scope & Terms"
            />
          </div>
          <textarea rows={8} value={scope} onChange={(e) => setScope(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {/* Deliverables */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Deliverables</h3>
            <button type="button" onClick={() => setDeliverables([...deliverables, { description: '', dueDate: '', acceptanceCriteria: '' }])}
              className="text-xs text-green-700 hover:underline">+ Add Deliverable</button>
          </div>
          <div className="space-y-3">
            {deliverables.map((d, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <input className="col-span-5 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Description"
                  value={d.description} onChange={(e) => { const upd = [...deliverables]; upd[i].description = e.target.value; setDeliverables(upd); }} />
                <input type="date" className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  value={d.dueDate?.split('T')[0] || ''} onChange={(e) => { const upd = [...deliverables]; upd[i].dueDate = e.target.value; setDeliverables(upd); }} />
                <input className="col-span-4 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Acceptance criteria"
                  value={d.acceptanceCriteria} onChange={(e) => { const upd = [...deliverables]; upd[i].acceptanceCriteria = e.target.value; setDeliverables(upd); }} />
                <button type="button" onClick={() => setDeliverables(deliverables.filter((_, j) => j !== i))} className="col-span-1 text-red-500 text-xs hover:underline">X</button>
              </div>
            ))}
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Cost Breakdown</h3>
            <button type="button" onClick={() => setCostBreakdown([...costBreakdown, { description: '', hours: 0, rate: 0, total: 0 }])}
              className="text-xs text-green-700 hover:underline">+ Add Line</button>
          </div>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 pb-2">Description</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2 w-24">Hours</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2 w-24">Rate (R)</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2 w-28">Total (R)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {costBreakdown.map((c, i) => (
                <tr key={i}>
                  <td className="py-1"><input className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={c.description}
                    onChange={(e) => { const upd = [...costBreakdown]; upd[i].description = e.target.value; setCostBreakdown(upd); }} /></td>
                  <td className="py-1 pl-2"><input type="number" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-right" value={c.hours}
                    onChange={(e) => { const upd = [...costBreakdown]; upd[i].hours = Number(e.target.value); upd[i].total = upd[i].hours * upd[i].rate; setCostBreakdown(upd); }} /></td>
                  <td className="py-1 pl-2"><input type="number" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-right" value={c.rate}
                    onChange={(e) => { const upd = [...costBreakdown]; upd[i].rate = Number(e.target.value); upd[i].total = upd[i].hours * upd[i].rate; setCostBreakdown(upd); }} /></td>
                  <td className="py-1 pl-2 text-right text-sm font-medium">R {c.total.toFixed(2)}</td>
                  <td className="py-1 pl-2"><button type="button" onClick={() => setCostBreakdown(costBreakdown.filter((_, j) => j !== i))} className="text-red-500 text-xs">X</button></td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-semibold">
                <td colSpan={3} className="py-2 text-sm text-right">Total:</td>
                <td className="py-2 text-sm text-right">R {totalAmount.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Timeline */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Timeline</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={timeline.startDate?.split('T')[0] || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                onChange={(e) => setTimeline({ ...timeline, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={timeline.endDate?.split('T')[0] || ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                onChange={(e) => setTimeline({ ...timeline, endDate: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Terms + Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
            <textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => {
            const validDeliverables = deliverables.filter((d) => d.description?.trim());
            const validCosts = costBreakdown.filter((c) => c.description?.trim() && c.total > 0);
            if (validDeliverables.length === 0) { setError('Add at least one deliverable description.'); return; }
            if (validCosts.length === 0) { setError('Add at least one cost line with a description and amount.'); return; }
            if (totalAmount <= 0) { setError('Total amount must be greater than zero.'); return; }
            setError('');
            createMutation.mutate();
          }} disabled={!scope.trim() || createMutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {createMutation.isPending ? 'Creating SOW...' : 'Create SOW'}
          </button>
          <button onClick={() => navigate(`/pm/staff/${staffId}`)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
