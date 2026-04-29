import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatR } from '../../lib/format';

interface PaymentAllocation {
  id: string; amount: string;
  invoice: { id: string; number: string };
}

interface Payment {
  id: string; partnerId: string; amount: string; paymentDate: string;
  paymentMethod: string; bankReference: string | null;
  notes: string | null; createdAt: string;
  partner: { name: string };
  allocations: PaymentAllocation[];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtMethod(m: string) {
  return m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function PaymentDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<{ data: Payment }>(`/finance/payments/${id}`),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="text-sm text-gray-400">Loading…</div></div>;
  if (!data?.data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-sm text-gray-400">Payment not found.</p>
      <Link to="/payments" className="text-xs text-blue-600 hover:underline">← Back to payments</Link>
    </div>
  );

  const p = data.data;
  const totalAllocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
  const unallocated    = Number(p.amount) - totalAllocated;

  return (
    <div className="space-y-5">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/payments" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
          Payments
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-xs text-gray-600">{p.bankReference ?? 'Payment'}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT: Payment record ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-6">

            {/* Hero */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                    Payment Received
                  </span>
                </div>
                <h1 className="text-2xl font-black text-gray-900">{fmtDate(p.paymentDate)}</h1>
                {p.bankReference && <p className="text-xs font-mono text-gray-400 mt-0.5">Ref: {p.bankReference}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Amount</p>
                <p className="text-3xl font-black text-green-700">{formatR(p.amount)}</p>
              </div>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-5 text-xs border-t border-gray-100 pt-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Partner</p>
                <p className="font-semibold text-gray-900">{p.partner.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Method</p>
                <p className="font-semibold text-gray-900">{fmtMethod(p.paymentMethod)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Recorded</p>
                <p className="text-gray-700">{fmtDate(p.createdAt)}</p>
              </div>
            </div>

            {p.notes && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1">Notes</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{p.notes}</p>
              </div>
            )}
          </div>

          {/* Allocations */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-semibold text-gray-900">Invoice Allocations</h3>
            </div>
            {p.allocations.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-gray-400">No invoices linked to this payment</p>
                <p className="text-[10px] text-gray-300 mt-1">Payment was recorded without invoice allocation</p>
              </div>
            ) : (
              <>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Invoice</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {p.allocations.map(alloc => (
                      <tr key={alloc.id}>
                        <td className="px-5 py-3">
                          <Link to={`/invoices/${alloc.invoice.id}`}
                            className="font-mono font-semibold text-blue-600 hover:underline">
                            {alloc.invoice.number}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-green-700">{formatR(alloc.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {p.allocations.length > 1 && (
                  <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex justify-between text-xs font-semibold text-gray-700">
                    <span>Total Allocated</span>
                    <span className="font-mono">{formatR(totalAllocated)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Summary sidebar ───────────────────────────── */}
        <div className="space-y-4">

          {/* Amount card */}
          <div className="card p-5 border-2 border-green-200 bg-green-50/30">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Amount Received</p>
            <p className="text-3xl font-black text-green-700 leading-none">{formatR(p.amount)}</p>
            {totalAllocated > 0 && (
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Allocated</span>
                  <span className="font-mono font-semibold">{formatR(totalAllocated)}</span>
                </div>
                {unallocated > 0.005 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Unallocated</span>
                    <span className="font-mono font-semibold">{formatR(unallocated)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Meta details */}
          <div className="card p-4 space-y-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Details</p>
            <div className="flex justify-between"><span className="text-gray-400">Partner</span><span className="text-gray-700 font-medium">{p.partner.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-700">{fmtDate(p.paymentDate)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Method</span><span className="text-gray-700">{fmtMethod(p.paymentMethod)}</span></div>
            {p.bankReference && <div className="flex justify-between"><span className="text-gray-400">Reference</span><span className="font-mono text-gray-700">{p.bankReference}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Invoices linked</span><span className="text-gray-700">{p.allocations.length}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
