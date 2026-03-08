import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { SearchableSelect } from '../../components/SearchableSelect';
import { v4 as uuidv4 } from 'uuid';

export function ExpenseCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api<{ data: { id: string; name: string; isActive: boolean }[] }>('/expenses/categories'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/expenses', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': uuidv4() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      navigate('/expenses');
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      categoryId,
      description: fd.get('description'),
      amount: Number(fd.get('amount')),
      taxAmount: Number(fd.get('taxAmount') || 0),
      taxInclusive,
      expenseDate: fd.get('expenseDate'),
      paymentMethod: fd.get('paymentMethod') || undefined,
      reference: fd.get('reference') || undefined,
      notes: fd.get('notes') || undefined,
    }, { onError: (err) => setError(err.message) });
  }

  const activeCategories = (categories?.data ?? []).filter((c) => c.isActive);
  const categoryOptions = activeCategories.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="Record Expense" />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
          <SearchableSelect
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Search categories..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <input name="description" required className={cls} placeholder="e.g. Stationery for office" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ZAR) *</label>
            <input name="amount" type="number" step="0.01" required className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Amount (ZAR)</label>
            <input name="taxAmount" type="number" step="0.01" defaultValue="0" className={cls} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)}
            className="rounded border-gray-300" />
          <label htmlFor="taxInclusive" className="text-sm text-gray-700">Amount includes VAT</label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input name="expenseDate" type="date" required className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select name="paymentMethod" className={cls}>
              <option value="">Select...</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="EFT">EFT</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
          <input name="reference" className={cls} placeholder="e.g. receipt number" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" rows={3} className={cls} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : 'Record Expense'}
          </button>
          <button type="button" onClick={() => navigate('/expenses')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
