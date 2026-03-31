import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface Deliverable {
  key: string;
  description: string;
  dueDate: string;
  acceptanceCriteria: string;
}

interface TimelineMilestone {
  key: string;
  name: string;
  date: string;
}

interface CostLine {
  key: string;
  description: string;
  hours: string;
  rate: string;
}

function emptyDeliverable(): Deliverable {
  return { key: crypto.randomUUID(), description: '', dueDate: '', acceptanceCriteria: '' };
}

function emptyMilestone(): TimelineMilestone {
  return { key: crypto.randomUUID(), name: '', date: '' };
}

function emptyCostLine(): CostLine {
  return { key: crypto.randomUUID(), description: '', hours: '', rate: '' };
}

export function SowCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [contractorType, setContractorType] = useState<'supplier' | 'staff'>('supplier');
  const [supplierId, setSupplierId] = useState('');
  const [staffUserId, setStaffUserId] = useState('');
  const [scope, setScope] = useState('');
  const [deliverables, setDeliverables] = useState<Deliverable[]>([emptyDeliverable()]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [milestones, setMilestones] = useState<TimelineMilestone[]>([emptyMilestone()]);
  const [costLines, setCostLines] = useState<CostLine[]>([emptyCostLine()]);
  const [terms, setTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');

  const { data: projectsData } = useQuery({
    queryKey: ['budgeting-projects-all'],
    queryFn: () =>
      api<{ data: { id: string; name: string; number: string }[] }>('/budgeting/projects?limit=500'),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () =>
      api<{ data: { id: string; name: string }[] }>('/suppliers?limit=500'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () =>
      api<{ data: { id: string; name: string }[] }>('/users?limit=500'),
  });

  const projects = projectsData?.data ?? [];
  const suppliers = suppliersData?.data ?? [];
  const users = usersData?.data ?? [];

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.number} — ${p.name}`,
  }));

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const staffOptions = users.map((u) => ({
    value: u.id,
    label: u.name,
  }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/budgeting/sow', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['sow-documents'] });
      navigate('/budgeting/sow');
    },
  });

  // Deliverable helpers
  function updateDeliverable(key: string, field: keyof Deliverable, value: string) {
    setDeliverables((prev) => prev.map((d) => (d.key === key ? { ...d, [field]: value } : d)));
  }
  function removeDeliverable(key: string) {
    setDeliverables((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  }

  // Milestone helpers
  function updateMilestone(key: string, field: keyof TimelineMilestone, value: string) {
    setMilestones((prev) => prev.map((m) => (m.key === key ? { ...m, [field]: value } : m)));
  }
  function removeMilestone(key: string) {
    setMilestones((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.key !== key)));
  }

  // Cost line helpers
  function updateCostLine(key: string, field: keyof CostLine, value: string) {
    setCostLines((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }
  function removeCostLine(key: string) {
    setCostLines((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)));
  }

  const grandTotal = costLines.reduce(
    (sum, c) => sum + (Number(c.hours) || 0) * (Number(c.rate) || 0),
    0,
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!projectId) {
      setError('Please select a project.');
      return;
    }
    if (contractorType === 'supplier' && !supplierId) {
      setError('Please select a contractor.');
      return;
    }
    if (contractorType === 'staff' && !staffUserId) {
      setError('Please select a staff member.');
      return;
    }
    if (!scope) {
      setError('Please provide a scope description.');
      return;
    }

    const validDeliverables = deliverables.filter((d) => d.description);
    const validMilestones = milestones.filter((m) => m.name && m.date);
    const validCostLines = costLines.filter(
      (c) => c.description && Number(c.hours) > 0 && Number(c.rate) > 0,
    );

    mutation.mutate(
      {
        projectId,
        contractorId: contractorType === 'supplier' ? supplierId : undefined,
        staffUserId: contractorType === 'staff' ? staffUserId : undefined,
        scope,
        deliverables: validDeliverables.map((d) => ({
          description: d.description,
          dueDate: d.dueDate || undefined,
          acceptanceCriteria: d.acceptanceCriteria || undefined,
        })),
        timeline: {
          startDate: startDate || new Date().toISOString(),
          endDate: endDate || new Date().toISOString(),
          milestones: validMilestones.map((m) => ({
            name: m.name,
            date: m.date,
          })),
        },
        costBreakdown: validCostLines.map((c) => ({
          description: c.description,
          hours: Number(c.hours),
          rate: Number(c.rate),
          total: Number(c.hours) * Number(c.rate),
        })),
        totalAmount: grandTotal,
        terms: terms || undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
      },
      { onError: (err) => setError(err.message) },
    );
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="New Statement of Work" backTo={{ label: 'Statements of Work', href: '/budgeting/sow' }} />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-5xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Project */}
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
          <SearchableSelect
            options={projectOptions}
            value={projectId}
            onChange={(v) => { setProjectId(v); setIsDirty(true); }}
            placeholder="Search projects..."
            required
          />
        </div>

        {/* Contractor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Contractor *</label>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="contractorType"
                checked={contractorType === 'supplier'}
                onChange={() => { setContractorType('supplier'); setStaffUserId(''); }}
              />
              Supplier / Contractor
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="contractorType"
                checked={contractorType === 'staff'}
                onChange={() => { setContractorType('staff'); setSupplierId(''); }}
              />
              Staff Member
            </label>
          </div>
          <div className="max-w-md">
            {contractorType === 'supplier' ? (
              <SearchableSelect
                options={supplierOptions}
                value={supplierId}
                onChange={(v) => { setSupplierId(v); setIsDirty(true); }}
                placeholder="Search suppliers..."
                required
              />
            ) : (
              <SearchableSelect
                options={staffOptions}
                value={staffUserId}
                onChange={(v) => { setStaffUserId(v); setIsDirty(true); }}
                placeholder="Search staff..."
                required
              />
            )}
          </div>
        </div>

        {/* Scope */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scope *</label>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={4}
            className={cls}
            placeholder="Describe the scope of work..."
          />
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Deliverables</label>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acceptance Criteria</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deliverables.map((d) => (
                  <tr key={d.key}>
                    <td className="px-3 py-2">
                      <input
                        value={d.description}
                        onChange={(e) => updateDeliverable(d.key, 'description', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        placeholder="Deliverable description"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={d.dueDate}
                        onChange={(e) => updateDeliverable(d.key, 'dueDate', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={d.acceptanceCriteria}
                        onChange={(e) => updateDeliverable(d.key, 'acceptanceCriteria', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        placeholder="Criteria for acceptance"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeDeliverable(d.key)}
                        className="text-red-400 hover:text-red-600 text-sm"
                        title="Remove deliverable"
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setDeliverables((prev) => [...prev, emptyDeliverable()])}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + Add Deliverable
          </button>
        </div>

        {/* Timeline */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Timeline</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={cls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={cls}
              />
            </div>
          </div>

          <label className="block text-xs text-gray-500 mb-2">Milestones</label>
          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.key} className="flex gap-2 items-center">
                <input
                  value={m.name}
                  onChange={(e) => updateMilestone(m.key, 'name', e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Milestone name"
                />
                <input
                  type="date"
                  value={m.date}
                  onChange={(e) => updateMilestone(m.key, 'date', e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeMilestone(m.key)}
                  className="text-red-400 hover:text-red-600 text-sm"
                  title="Remove milestone"
                >
                  X
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + Add Milestone
          </button>
        </div>

        {/* Cost Breakdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cost Breakdown</label>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate (R)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {costLines.map((c) => {
                  const lineTotal = (Number(c.hours) || 0) * (Number(c.rate) || 0);
                  return (
                    <tr key={c.key}>
                      <td className="px-3 py-2">
                        <input
                          value={c.description}
                          onChange={(e) => updateCostLine(c.key, 'description', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          placeholder="Cost item description"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={c.hours}
                          onChange={(e) => updateCostLine(c.key, 'hours', e.target.value)}
                          className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.rate}
                          onChange={(e) => updateCostLine(c.key, 'rate', e.target.value)}
                          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                        R {lineTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeCostLine(c.key)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="Remove cost line"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setCostLines((prev) => [...prev, emptyCostLine()])}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + Add Cost Line
          </button>
        </div>

        {/* Grand Total */}
        <div className="flex justify-end">
          <div className="text-right">
            <span className="text-sm text-gray-500 mr-3">Total Amount:</span>
            <span className="text-lg font-bold font-mono">R {grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Terms */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Terms</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            className={cls}
            placeholder="Terms and conditions..."
          />
        </div>

        {/* Valid Until */}
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={cls}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={cls}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create SOW'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/budgeting/sow')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
