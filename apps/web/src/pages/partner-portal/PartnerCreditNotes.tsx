import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';
import { ActionMenu } from '../../components/ActionMenu';

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
  allocatedAmount: string;
  availableAmount: string;
  consumptionStatus: 'AVAILABLE' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED' | 'VOIDED';
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

  const availableTotal = items
    .reduce((sum, cn) => sum + Number(cn.availableAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Credit Notes</h1>
        {availableTotal > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
            <span className="text-sm text-green-700">
              Available credit: <span className="font-bold">{formatPrice(availableTotal)}</span>
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
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
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
                      {cn.consumptionStatus === 'VOIDED' || cn.voidedAt ? (
                        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 line-through">
                          VOIDED
                        </span>
                      ) : cn.consumptionStatus === 'FULLY_ALLOCATED' ? (
                        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          Fully Applied
                        </span>
                      ) : cn.consumptionStatus === 'PARTIALLY_ALLOCATED' ? (
                        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          Partial — {formatPrice(cn.availableAmount)} left
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{formatDate(cn.createdAt)}</td>
                    <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        items={[
                          {
                            label: 'View Details',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                            onClick: () => setSelectedCn(cn),
                          },
                          {
                            label: 'Download PDF',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                            onClick: () => window.open(`/api/v1/finance/credit-notes/${cn.id}/pdf`, '_blank'),
                            hidden: !!cn.voidedAt,
                          },
                          {
                            label: 'Print',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
                            onClick: () => {
                              const w = window.open(`/api/v1/finance/credit-notes/${cn.id}/pdf`, '_blank');
                              w?.addEventListener('load', () => w.print());
                            },
                            hidden: !!cn.voidedAt,
                          },
                          {
                            label: 'Email Copy',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
                            hidden: !!cn.voidedAt,
                            onClick: async () => {
                              try {
                                await partnerApi(`/documents/credit-notes/${cn.id}/email`, { method: 'POST' });
                              } catch { /* handled by partnerApi */ }
                            },
                          },
                          {
                            label: 'Copy Credit Note #',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                            onClick: () => navigator.clipboard.writeText(cn.number),
                          },
                        ]}
                      />
                    </td>
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
                  ) : selectedCn.consumptionStatus === 'FULLY_ALLOCATED' ? (
                    <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">Fully Applied</span>
                  ) : selectedCn.consumptionStatus === 'PARTIALLY_ALLOCATED' ? (
                    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Partial — {formatPrice(selectedCn.availableAmount)} left</span>
                  ) : (
                    <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Available</span>
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
