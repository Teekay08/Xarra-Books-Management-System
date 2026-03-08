import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';

interface CreditNote {
  id: string;
  number: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  reason: string;
  voidedAt: string | null;
  createdAt: string;
  invoice: { id: string; number: string };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPrice(val: number | string) {
  return `R ${Number(val).toFixed(2)}`;
}

export function PartnerCreditNotes() {
  const [page, setPage] = useState(1);
  const [selectedCn, setSelectedCn] = useState<CreditNote | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-credit-notes', page],
    queryFn: () =>
      partnerApi<PaginatedResponse<CreditNote>>(`/documents/credit-notes?page=${page}&limit=20`),
  });

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const activeTotal = items
    .filter((cn) => !cn.voidedAt)
    .reduce((sum, cn) => sum + Number(cn.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Credit Notes</h1>
        {activeTotal > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
            <span className="text-sm text-green-700">
              Available credit: <span className="font-bold">{formatPrice(activeTotal)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            No credit notes found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Credit Note #</th>
                  <th className="px-6 py-3 font-medium">Against Invoice</th>
                  <th className="px-6 py-3 font-medium">Reason</th>
                  <th className="px-6 py-3 font-medium text-right">Subtotal</th>
                  <th className="px-6 py-3 font-medium text-right">VAT</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((cn) => (
                  <tr
                    key={cn.id}
                    className={`border-b last:border-0 hover:bg-gray-50 cursor-pointer ${cn.voidedAt ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedCn(cn)}
                  >
                    <td className="px-6 py-3 font-medium text-green-700">{cn.number}</td>
                    <td className="px-6 py-3 text-gray-600">{cn.invoice?.number ?? '-'}</td>
                    <td className="px-6 py-3 text-gray-600 max-w-[200px] truncate">{cn.reason}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{formatPrice(cn.subtotal)}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{formatPrice(cn.vatAmount)}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">{formatPrice(cn.total)}</td>
                    <td className="px-6 py-3">
                      {cn.voidedAt ? (
                        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 line-through">
                          VOIDED
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{formatDate(cn.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-sm text-gray-600">Page {page} of {pagination.totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Credit Note Detail Modal */}
      {selectedCn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Credit Note {selectedCn.number}</h2>
              <button
                onClick={() => setSelectedCn(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Against Invoice</p>
                  <p className="font-medium text-gray-900">{selectedCn.invoice?.number}</p>
                </div>
                <div>
                  <p className="text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{formatDate(selectedCn.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  {selectedCn.voidedAt ? (
                    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">VOIDED</span>
                  ) : (
                    <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">ACTIVE</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">Reason</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedCn.reason}</p>
              </div>

              <div className="rounded-md bg-gray-50 p-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900">{formatPrice(selectedCn.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">VAT (15%)</span>
                    <span className="text-gray-900">{formatPrice(selectedCn.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold text-base">
                    <span className="text-green-700">Credit Amount</span>
                    <span className="text-green-700">{formatPrice(selectedCn.total)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                This credit note reduces the balance due on invoice {selectedCn.invoice?.number}.
                It will be automatically applied when calculating the amount payable.
              </p>
            </div>
            <div className="flex justify-end border-t px-6 py-4">
              <button
                onClick={() => setSelectedCn(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
