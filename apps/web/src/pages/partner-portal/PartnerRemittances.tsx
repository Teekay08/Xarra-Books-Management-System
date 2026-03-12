import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { partnerApi, getPartnerUser, type PaginatedResponse } from '../../lib/partner-api';
import { useEffect } from 'react';
import { ActionMenu } from '../../components/ActionMenu';

interface Remittance {
  id: string;
  partnerRef: string | null;
  totalAmount: string;
  status: string;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
  _invoiceCount?: number;
  _creditTotal?: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  VERIFIED: 'bg-teal-100 text-teal-800',
  APPROVED: 'bg-green-100 text-green-800',
  MATCHED: 'bg-green-100 text-green-800',
  DISPUTED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  MATCHED: 'Matched',
  DISPUTED: 'Disputed',
};

export function PartnerRemittances() {
  const navigate = useNavigate();
  const user = getPartnerUser();
  const isHq = !user?.branchId;

  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!isHq) return;
    async function fetchData() {
      setLoading(true);
      try {
        const res = await partnerApi<PaginatedResponse<Remittance>>(
          `/remittances?page=${page}&limit=20`,
        );
        setRemittances(res.data);
        setTotalPages(res.pagination.totalPages);
        setTotal(res.pagination.total);
      } catch {
        // handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [page, isHq]);

  if (!isHq) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Remittances are managed by your head office.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Remittances</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit and track payment remittances to Xarra Books.
          </p>
        </div>
        <Link
          to="/partner/remittances/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Create Remittance
        </Link>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : remittances.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            No remittances yet. Create one to record a payment to Xarra Books.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {remittances.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/partner/remittances/${r.id}`)}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-3 font-medium text-primary">
                      {r.partnerRef || '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.periodFrom && r.periodTo
                        ? `${new Date(r.periodFrom).toLocaleDateString('en-ZA')} — ${new Date(r.periodTo).toLocaleDateString('en-ZA')}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900 font-mono">
                      R {Number(r.totalAmount).toFixed(2)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(r.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        items={[
                          {
                            label: 'View Details',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                            onClick: () => navigate(`/partner/remittances/${r.id}`),
                          },
                          {
                            label: 'Edit',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                            hidden: r.status !== 'PENDING',
                            onClick: () => navigate(`/partner/remittances/${r.id}`),
                          },
                          {
                            label: 'Download PDF',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                            hidden: r.status === 'PENDING',
                            onClick: () => window.open(`/api/v1/finance/remittances/${r.id}/pdf`, '_blank'),
                          },
                          {
                            label: 'Copy Reference #',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                            onClick: () => navigator.clipboard.writeText(r.partnerRef ?? r.id),
                          },
                          {
                            label: 'Withdraw',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
                            variant: 'danger',
                            hidden: r.status !== 'PENDING',
                            onClick: async () => {
                              if (!confirm('Are you sure you want to withdraw this remittance?')) return;
                              try {
                                await partnerApi(`/remittances/${r.id}/withdraw`, { method: 'POST' });
                                setRemittances((prev) => prev.map((rem) => rem.id === r.id ? { ...rem, status: 'WITHDRAWN' } : rem));
                              } catch { /* handled by partnerApi */ }
                            },
                          },
                          {
                            label: 'Delete',
                            icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                            variant: 'danger',
                            hidden: r.status !== 'PENDING',
                            onClick: async () => {
                              if (!confirm('Are you sure you want to delete this remittance? This cannot be undone.')) return;
                              try {
                                await partnerApi(`/remittances/${r.id}`, { method: 'DELETE' });
                                setRemittances((prev) => prev.filter((rem) => rem.id !== r.id));
                                setTotal((t) => t - 1);
                              } catch { /* handled by partnerApi */ }
                            },
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
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
