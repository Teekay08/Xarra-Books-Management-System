import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface StockCheckLine {
  titleId: string;
  titleLabel: string;
  quantity: number;
}

interface StockCheckResult {
  titleId: string;
  title: string;
  isbn13: string | null;
  quantityOrdered: number;
  warehouseStock: number;
  isAvailable: boolean;
  shortfall: number;
}

interface StockCheckResponse {
  data: {
    lines: StockCheckResult[];
    allAvailable: boolean;
  };
}

interface StockCheckModalProps {
  lines: StockCheckLine[];
  onProceed: () => void;
  onCancel: () => void;
}

export function StockCheckModal({ lines, onProceed, onCancel }: StockCheckModalProps) {
  const [results, setResults] = useState<StockCheckResult[] | null>(null);
  const [allAvailable, setAllAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const validLines = lines.filter(l => l.titleId && l.quantity > 0);
    if (validLines.length === 0) {
      setLoading(false);
      return;
    }

    api<StockCheckResponse>('/partner-admin/orders/stock-check', {
      method: 'POST',
      body: JSON.stringify({
        lines: validLines.map(l => ({ titleId: l.titleId, quantity: l.quantity })),
      }),
    })
      .then(res => {
        setResults(res.data.lines);
        setAllAvailable(res.data.allAvailable);
      })
      .catch(err => {
        setError(err.message ?? 'Stock check failed');
      })
      .finally(() => setLoading(false));
  }, []);

  const shortfallCount = results?.filter(r => !r.isAvailable).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Stock Availability Check</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Checking warehouse stock for ordered titles
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Checking warehouse stock…</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center gap-2">
              <span className="text-red-400 shrink-0">⚠</span>
              <div>
                <p className="font-medium">Stock check failed</p>
                <p className="text-red-500 mt-0.5">{error}</p>
                <p className="text-red-600 mt-2">You can still proceed — stock will need to be verified manually.</p>
              </div>
            </div>
          )}

          {!loading && !error && results && (
            <>
              {/* Summary banner */}
              {allAvailable ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2.5 mb-4">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-green-800">All titles in stock</p>
                    <p className="text-xs text-green-600">Warehouse has sufficient stock to fulfil this order.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2.5 mb-4">
                  <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {shortfallCount} title{shortfallCount !== 1 ? 's' : ''} with insufficient stock
                    </p>
                    <p className="text-xs text-amber-600">
                      You can still proceed — affected lines will need backorder handling.
                    </p>
                  </div>
                </div>
              )}

              {/* Results table */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Title</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">Ordered</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 w-24">In Stock</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map(r => (
                      <tr
                        key={r.titleId}
                        className={r.isAvailable ? 'bg-white' : 'bg-red-50'}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-sm leading-snug">{r.title}</p>
                          {r.isbn13 && (
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{r.isbn13}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-semibold text-gray-900">{r.quantityOrdered}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${r.warehouseStock < r.quantityOrdered ? 'text-red-600' : 'text-gray-900'}`}>
                            {r.warehouseStock}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.isAvailable ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Available
                            </span>
                          ) : r.warehouseStock === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Out of stock
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
                                </svg>
                                Short by {r.shortfall}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!allAvailable && (
                <p className="text-xs text-gray-500 mt-3">
                  Tip: After capturing, you can set backorder quantities and ETAs on individual order lines from the order detail page.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-white transition-colors"
          >
            Back to Edit
          </button>

          {error ? (
            <button
              onClick={onProceed}
              className="px-5 py-2 bg-[#8B1A1A] text-white rounded-lg text-sm font-semibold hover:bg-[#7a1717] transition-colors"
            >
              Proceed Anyway
            </button>
          ) : !loading && (
            allAvailable ? (
              <button
                onClick={onProceed}
                className="px-5 py-2 bg-[#8B1A1A] text-white rounded-lg text-sm font-semibold hover:bg-[#7a1717] transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Confirm & Capture Order
              </button>
            ) : (
              <button
                onClick={onProceed}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Capture with Backorders
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
