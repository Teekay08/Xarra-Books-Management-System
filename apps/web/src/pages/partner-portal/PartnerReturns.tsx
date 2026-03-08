import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';

interface ReturnRequest {
  id: string;
  number: string;
  createdAt: string;
  status: string;
  reason: string;
  lines: any[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  AWAITING_PICKUP: 'bg-orange-100 text-orange-800',
  IN_TRANSIT: 'bg-purple-100 text-purple-800',
  RECEIVED: 'bg-teal-100 text-teal-800',
  INSPECTED: 'bg-indigo-100 text-indigo-800',
  CREDIT_ISSUED: 'bg-emerald-100 text-emerald-800',
};

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function PartnerReturns() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReturns() {
      setLoading(true);
      try {
        const res = await partnerApi<PaginatedResponse<ReturnRequest>>(
          `/returns?page=${page}&limit=20`
        );
        setReturns(res.data);
        setTotalPages(res.pagination.totalPages);
      } catch {
        // errors handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchReturns();
  }, [page]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Return Requests</h1>
        <Link
          to="/partner/returns/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Return Request
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        {returns.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No return requests found. Click "New Return Request" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Request #</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Reason</th>
                  <th className="px-6 py-3 font-medium text-right">Items</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr
                    key={ret.id}
                    onClick={() => navigate(`/partner/returns/${ret.id}`)}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-3 font-medium text-primary">
                      {ret.number}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(ret.createdAt).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ret.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {formatStatus(ret.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 max-w-[250px] truncate">
                      {ret.reason}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {ret.lines?.length ?? 0}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        to={`/partner/returns/${ret.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
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
                disabled={page <= 1}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
