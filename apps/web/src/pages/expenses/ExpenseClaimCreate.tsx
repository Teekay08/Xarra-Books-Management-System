import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface ClaimLine {
  key: string;
  categoryId: string;
  description: string;
  amount: string;
  taxAmount: string;
  receiptUrl: string;
  expenseDate: string;
}

function emptyLine(): ClaimLine {
  return {
    key: crypto.randomUUID(),
    categoryId: '',
    description: '',
    amount: '',
    taxAmount: '0',
    receiptUrl: '',
    expenseDate: '',
  };
}

function formatR(val: number) {
  return `R ${val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ExpenseClaimCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ClaimLine[]>([emptyLine()]);

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api<{ data: { id: string; name: string; isActive: boolean }[] }>('/expenses/categories'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/expenses/claims', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] });
      navigate('/expenses/claims');
    },
  });

  const activeCategories = (categories?.data ?? []).filter((c) => c.isActive);

  const categoryOptions = activeCategories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  function updateLine(key: string, field: keyof ClaimLine, value: string) {
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

  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const validLines = lines.filter((l) => l.categoryId && l.description && Number(l.amount) > 0);
    if (validLines.length === 0) {
      setError('At least one valid line item is required.');
      return;
    }

    mutation.mutate(
      {
        claimDate,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          categoryId: l.categoryId,
          description: l.description,
          amount: Number(l.amount),
          taxAmount: Number(l.taxAmount) || 0,
          receiptUrl: l.receiptUrl || undefined,
          expenseDate: l.expenseDate || undefined,
        })),
      },
      { onError: (err) => setError(err.message) }
    );
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="New Expense Claim" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-4xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">Claim Date *</label>
          <input
            type="date"
            required
            value={claimDate}
            onChange={(e) => setClaimDate(e.target.value)}
            className={cls}
          />
        </div>

        {/* Line items */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receipt URL</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expense Date</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        options={categoryOptions}
                        value={line.categoryId}
                        onChange={(v) => updateLine(line.key, 'categoryId', v)}
                        placeholder="Search categories..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        placeholder="Description"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(line.key, 'amount', e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.taxAmount}
                        onChange={(e) => updateLine(line.key, 'taxAmount', e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={line.receiptUrl}
                        onChange={(e) => updateLine(line.key, 'receiptUrl', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        placeholder="https://..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={line.expenseDate}
                        onChange={(e) => updateLine(line.key, 'expenseDate', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
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
                ))}
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

        {/* Total */}
        <div className="flex justify-end">
          <div className="text-right">
            <span className="text-sm text-gray-500 mr-3">Total:</span>
            <span className="text-lg font-bold font-mono">{formatR(total)}</span>
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
            {mutation.isPending ? 'Submitting...' : 'Submit Claim'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/expenses/claims')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
