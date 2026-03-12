import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Expense {
  id: string;
  categoryId: string;
  description: string;
  amount: string;
  taxAmount: string;
  taxInclusive: boolean;
  expenseDate: string;
  paymentMethod: string;
  reference: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  category: { name: string };
}

export function ExpenseDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['expense', id],
    queryFn: () => api<{ data: Expense }>(`/expenses/${id}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Expense not found.</div>;

  const e = data.data;

  return (
    <div>
      <PageHeader title="Expense Detail" subtitle={e.description} backTo={{ label: 'Back to Expenses', href: '/expenses' }} />

      <div className="max-w-3xl space-y-6">
        {/* Meta info */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Category</span>
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 mt-1">
                {e.category.name}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Expense Date</span>
              <span>{new Date(e.expenseDate).toLocaleDateString('en-ZA')}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Amount</span>
              <span className="font-mono font-bold">R {Number(e.amount).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Tax</span>
              <span className="font-mono">R {Number(e.taxAmount).toFixed(2)}</span>
              <span className="ml-1 text-xs text-gray-400">({e.taxInclusive ? 'inclusive' : 'exclusive'})</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Payment Method</span>
              <span>{e.paymentMethod}</span>
            </div>
            {e.reference && (
              <div>
                <span className="text-xs text-gray-500 block">Reference</span>
                <span>{e.reference}</span>
              </div>
            )}
          </div>
        </div>

        {/* Receipt */}
        {e.receiptUrl && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Receipt</h3>
            <a
              href={e.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-700 hover:underline"
            >
              View Receipt
            </a>
          </div>
        )}

        {/* Notes */}
        {e.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{e.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
