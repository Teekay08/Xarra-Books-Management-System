import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { formatR } from '../../lib/format';

interface CashSaleLine {
  id: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  title?: { title: string; isbn13: string | null };
}

interface CashSale {
  id: string;
  saleNumber: string;
  customerName: string | null;
  saleDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  taxInclusive: boolean;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  lines: CashSaleLine[];
}


export function CashSaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cash-sale', id],
    queryFn: () => api<{ data: CashSale }>(`/sales/cash-sales/${id}`),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/sales/cash-sales/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-sale', id] });
      setShowVoidModal(false);
      setVoidReason('');
    },
    onError: (err) => setVoidError(err.message),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Cash sale not found</div>;

  const sale = data.data;
  const isVoided = !!sale.voidedAt;

  function handleVoidSubmit() {
    setVoidError('');
    if (!voidReason.trim()) {
      setVoidError('Please provide a reason for voiding this sale');
      return;
    }
    voidMutation.mutate(voidReason.trim());
  }

  return (
    <div>
      <PageHeader
        title={`Cash Sale ${sale.saleNumber}`}
        subtitle={new Date(sale.saleDate).toLocaleDateString('en-ZA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
        backTo={{ label: 'Back to Cash Sales', href: '/sales/cash-sales' }}
        action={
          <div className="flex gap-2">
            <a
              href={`/api/v1/sales/cash-sales/${id}/receipt-pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Receipt PDF
            </a>
            {!isVoided && (
              <button
                onClick={() => setShowVoidModal(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Void Sale
              </button>
            )}
          </div>
        }
      />

      {/* Voided banner */}
      {isVoided && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-semibold">This sale has been voided</span>
          </div>
          <p className="mt-1 text-sm text-red-700">
            <span className="font-medium">Reason:</span> {sale.voidReason}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Voided on {new Date(sale.voidedAt!).toLocaleDateString('en-ZA')}{' '}
            at {new Date(sale.voidedAt!).toLocaleTimeString('en-ZA')}
          </p>
        </div>
      )}

      {/* Sale meta */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetaCard label="Sale Date" value={new Date(sale.saleDate).toLocaleDateString('en-ZA')} />
        <MetaCard label="Customer" value={sale.customerName || 'Walk-in'} />
        <MetaCard label="Payment Method" value={sale.paymentMethod} />
        <MetaCard label="Payment Reference" value={sale.paymentReference || '---'} />
        <MetaCard
          label="Status"
          value={isVoided ? 'VOIDED' : 'COMPLETED'}
          badge={isVoided ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}
        />
      </div>

      {/* Line items */}
      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2">Title</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit Price</th>
              <th className="pb-2 text-right">Discount %</th>
              <th className="pb-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sale.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2">
                  <p className="font-medium">{line.title?.title ?? '---'}</p>
                  {line.title?.isbn13 && (
                    <p className="text-xs text-gray-400">{line.title.isbn13}</p>
                  )}
                </td>
                <td className="py-2 text-right font-mono">{line.quantity}</td>
                <td className="py-2 text-right font-mono">{formatR(line.unitPrice)}</td>
                <td className="py-2 text-right">{Number(line.discount)}%</td>
                <td className="py-2 text-right font-mono font-semibold">
                  {formatR(line.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="card p-4 mb-6">
        <div className="flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-mono">{formatR(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                VAT (15%){sale.taxInclusive ? ' - inclusive' : ''}
              </span>
              <span className="font-mono">{formatR(sale.vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatR(sale.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {sale.notes && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{sale.notes}</p>
        </div>
      )}

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Void Cash Sale</h3>
            <p className="text-sm text-gray-500 mb-4">
              This action cannot be undone. The sale <span className="font-mono font-medium">{sale.saleNumber}</span> will be marked as voided.
            </p>

            {voidError && (
              <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{voidError}</div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Why is this sale being voided?"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidReason('');
                  setVoidError('');
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidSubmit}
                disabled={voidMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {voidMutation.isPending ? 'Voiding...' : 'Void Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      {badge ? (
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
          {value}
        </span>
      ) : (
        <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
      )}
    </div>
  );
}
