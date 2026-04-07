import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { formatR } from '../../lib/format';

interface ReqLine {
  key: string;
  description: string;
  quantity: string;
  estimatedUnitPrice: string;
  notes: string;
}

function emptyLine(): ReqLine {
  return {
    key: crypto.randomUUID(),
    description: '',
    quantity: '1',
    estimatedUnitPrice: '',
    notes: '',
  };
}


export function RequisitionCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [department, setDepartment] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ReqLine[]>([emptyLine()]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/expenses/requisitions', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      navigate('/procurement/requisitions');
    },
  });

  function updateLine(key: string, field: keyof ReqLine, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  const totalEstimate = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.estimatedUnitPrice) || 0),
    0
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!department.trim()) {
      setError('Department is required.');
      return;
    }

    const validLines = lines.filter((l) => l.description && Number(l.estimatedUnitPrice) > 0);
    if (validLines.length === 0) {
      setError('At least one valid line item is required.');
      return;
    }

    mutation.mutate(
      {
        department: department.trim(),
        requiredByDate: requiredByDate || undefined,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 1,
          estimatedUnitPrice: Number(l.estimatedUnitPrice),
          notes: l.notes || undefined,
        })),
      },
      { onError: (err) => setError(err.message) }
    );
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="New Requisition" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              className={cls}
              placeholder="e.g. Editorial, Operations"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Required By Date</label>
            <input
              type="date"
              value={requiredByDate}
              onChange={(e) => setRequiredByDate(e.target.value)}
              className={cls}
            />
          </div>
        </div>

        {/* Line items */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Est. Unit Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Est. Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lines.map((line) => {
                  const lineTotal = (Number(line.quantity) || 0) * (Number(line.estimatedUnitPrice) || 0);
                  return (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          placeholder="Item description"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                          className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.estimatedUnitPrice}
                          onChange={(e) => updateLine(line.key, 'estimatedUnitPrice', e.target.value)}
                          className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm text-gray-600">
                        {formatR(lineTotal)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={line.notes}
                          onChange={(e) => updateLine(line.key, 'notes', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          placeholder="Optional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="Remove line"
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
            onClick={addLine}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + Add Line
          </button>
        </div>

        {/* Total estimate */}
        <div className="flex justify-end">
          <div className="text-right">
            <span className="text-sm text-gray-500 mr-3">Total Estimate:</span>
            <span className="text-lg font-bold font-mono">{formatR(totalEstimate)}</span>
          </div>
        </div>

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
            {mutation.isPending ? 'Submitting...' : 'Submit Requisition'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/procurement/requisitions')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
