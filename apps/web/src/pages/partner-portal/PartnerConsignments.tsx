import { useEffect, useState } from 'react';
import { partnerApi, getPartnerToken, type PaginatedResponse } from '../../lib/partner-api';

interface ConsignmentLineTitle {
  id: string;
  title: string;
}

interface ConsignmentLine {
  id: string;
  qtyDispatched: number;
  qtySold: number;
  qtyReturned: number;
  title: ConsignmentLineTitle | null;
}

interface Consignment {
  id: string;
  dispatchDate: string | null;
  status: string;
  courierCompany: string | null;
  courierWaybill: string | null;
  lines?: ConsignmentLine[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  DISPATCHED: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  ACKNOWLEDGED: 'bg-purple-100 text-purple-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PartnerConsignments() {
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineLoading, setLineLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConsignments() {
      setLoading(true);
      try {
        const res = await partnerApi<PaginatedResponse<Consignment>>(
          `/documents/consignments?page=${page}&limit=20`
        );
        setConsignments(res.data);
        setTotalPages(res.pagination.totalPages);
      } catch {
        // handled by partnerApi (401 redirect, etc.)
      } finally {
        setLoading(false);
      }
    }
    fetchConsignments();
  }, [page]);

  async function toggleExpand(consignment: Consignment) {
    if (expandedId === consignment.id) {
      setExpandedId(null);
      return;
    }

    // If lines are already loaded, just expand
    if (consignment.lines) {
      setExpandedId(consignment.id);
      return;
    }

    // Fetch consignment detail with lines
    setLineLoading(consignment.id);
    try {
      const res = await partnerApi<{ data: Consignment }>(
        `/documents/consignments/${consignment.id}`
      );
      setConsignments((prev) =>
        prev.map((c) => (c.id === consignment.id ? { ...c, lines: res.data.lines } : c))
      );
      setExpandedId(consignment.id);
    } catch {
      // handled by partnerApi
    } finally {
      setLineLoading(null);
    }
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
      <h1 className="text-2xl font-bold text-gray-900">Consignments</h1>

      <div className="rounded-lg border bg-white shadow-sm">
        {consignments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No consignments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="w-10 px-3 py-3" />
                  <th className="px-6 py-3 font-medium">Dispatch Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Courier</th>
                  <th className="px-6 py-3 font-medium">Waybill</th>
                  <th className="px-6 py-3 font-medium text-right">Items</th>
                  <th className="px-6 py-3 font-medium text-right">Documents</th>
                </tr>
              </thead>
              <tbody>
                {consignments.map((con) => (
                  <ExpandableRow
                    key={con.id}
                    consignment={con}
                    isExpanded={expandedId === con.id}
                    isLoading={lineLoading === con.id}
                    onToggle={() => toggleExpand(con)}
                  />
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
    </div>
  );
}

function ExpandableRow({
  consignment,
  isExpanded,
  isLoading,
  onToggle,
}: {
  consignment: Consignment;
  isExpanded: boolean;
  isLoading: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-center">
          {isLoading ? (
            <div className="inline-block animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          ) : (
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </td>
        <td className="px-6 py-3 text-gray-900">{consignment.dispatchDate ? formatDate(consignment.dispatchDate) : '-'}</td>
        <td className="px-6 py-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[consignment.status] ?? 'bg-gray-100 text-gray-800'}`}
          >
            {consignment.status}
          </span>
        </td>
        <td className="px-6 py-3 text-gray-600">{consignment.courierCompany ?? '-'}</td>
        <td className="px-6 py-3 text-gray-600">{consignment.courierWaybill ?? '-'}</td>
        <td className="px-6 py-3 text-right text-gray-900">{consignment.lines?.length ?? 0}</td>
        <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2 justify-end">
            <button
              onClick={async () => {
                const token = getPartnerToken();
                const res = await fetch(`/api/v1/partner-portal/documents/consignments/${consignment.id}/proforma-pdf`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Download PDF
            </button>
            <button
              onClick={async () => {
                const token = getPartnerToken();
                const res = await fetch(`/api/v1/partner-portal/documents/consignments/${consignment.id}/proforma-pdf`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const w = window.open(url, '_blank');
                w?.addEventListener('load', () => w.print());
              }}
              className="text-xs text-gray-600 hover:text-gray-700 font-medium"
            >
              Print
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && consignment.lines && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium text-right">Qty Dispatched</th>
                  <th className="px-3 py-2 font-medium text-right">Qty Sold</th>
                  <th className="px-3 py-2 font-medium text-right">Qty Returned</th>
                </tr>
              </thead>
              <tbody>
                {consignment.lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-900">{line.title?.title ?? '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{line.qtyDispatched}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{line.qtySold}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{line.qtyReturned}</td>
                  </tr>
                ))}
                {consignment.lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                      No line items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
