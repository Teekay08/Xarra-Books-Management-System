import { useEffect, useState } from 'react';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';

interface Invoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  subtotal: string;
  vatAmount: string;
  total: string;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  partner: { id: string; name: string } | null;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  OVERDUE: 'bg-red-100 text-red-800',
  VOIDED: 'bg-gray-100 text-gray-500 line-through',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPrice(val: number | string) {
  return `R ${Number(val).toFixed(2)}`;
}

export function PartnerInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function fetchInvoices() {
      setLoading(true);
      try {
        const res = await partnerApi<PaginatedResponse<Invoice>>(
          `/documents/invoices?page=${page}&limit=20`
        );
        setInvoices(res.data);
        setTotalPages(res.pagination.totalPages);
      } catch {
        // handled by partnerApi (401 redirect, etc.)
      } finally {
        setLoading(false);
      }
    }
    fetchInvoices();
  }, [page]);

  async function viewDetail(invoiceId: string) {
    setDetailLoading(true);
    try {
      const res = await partnerApi<{ data: InvoiceDetail }>(
        `/documents/invoices/${invoiceId}`
      );
      setSelectedInvoice(res.data);
    } catch {
      // handled by partnerApi
    } finally {
      setDetailLoading(false);
    }
  }

  function downloadPdf(invoiceId: string) {
    window.open(`/api/v1/finance/invoices/${invoiceId}/pdf`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>

      {/* Invoice Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        {invoices.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No invoices found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Invoice #</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Due Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Subtotal</th>
                  <th className="px-6 py-3 font-medium text-right">VAT</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <button
                        onClick={() => viewDetail(inv.id)}
                        className="font-medium text-primary hover:underline"
                      >
                        {inv.number}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-6 py-3 text-gray-600">{inv.dueDate ? formatDate(inv.dueDate) : '-'}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {formatPrice(inv.subtotal)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {formatPrice(inv.vatAmount)}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      {formatPrice(inv.total)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => downloadPdf(inv.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            const w = window.open(`/api/v1/finance/invoices/${inv.id}/pdf`, '_blank');
                            w?.addEventListener('load', () => w.print());
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {(selectedInvoice || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {detailLoading ? 'Loading...' : `Invoice ${selectedInvoice?.number}`}
              </h2>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : selectedInvoice ? (
              <div className="max-h-[70vh] overflow-y-auto">
                {/* Invoice Info */}
                <div className="grid grid-cols-2 gap-4 border-b px-6 py-4 text-sm">
                  <div>
                    <p className="text-gray-500">Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedInvoice.invoiceDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Due Date</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedInvoice.status] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {selectedInvoice.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500">Partner</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.partner?.name ?? '-'}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div className="px-6 py-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Line Items</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-gray-600">
                        <th className="px-3 py-2 font-medium">Title</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                        <th className="px-3 py-2 font-medium text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.lines.map((line) => (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-gray-900">{line.description}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{line.quantity}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {formatPrice(line.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            {formatPrice(line.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="border-t px-6 py-4">
                  <div className="ml-auto w-64 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="text-gray-900">{formatPrice(selectedInvoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">VAT (15%)</span>
                      <span className="text-gray-900">{formatPrice(selectedInvoice.vatAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span className="text-gray-900">Total</span>
                      <span className="text-gray-900">{formatPrice(selectedInvoice.total)}</span>
                    </div>
                  </div>
                </div>

                {selectedInvoice.notes && (
                  <div className="border-t px-6 py-4">
                    <p className="text-sm text-gray-500">Notes</p>
                    <p className="mt-1 text-sm text-gray-700">{selectedInvoice.notes}</p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Modal Footer */}
            {selectedInvoice && (
              <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                <button
                  onClick={() => downloadPdf(selectedInvoice.id)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    const w = window.open(`/api/v1/finance/invoices/${selectedInvoice.id}/pdf`, '_blank');
                    w?.addEventListener('load', () => w.print());
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
