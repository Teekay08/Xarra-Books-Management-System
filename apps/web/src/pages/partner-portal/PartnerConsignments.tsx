import { useEffect, useState } from 'react';
import { partnerApi, getPartnerToken, type PaginatedResponse } from '../../lib/partner-api';
import { PartnerBranchFilter } from '../../components/PartnerBranchFilter';
import { ActionMenu } from '../../components/ActionMenu';

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
  const [branchFilter, setBranchFilter] = useState('');

  useEffect(() => {
    async function fetchConsignments() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (branchFilter) params.set('branchId', branchFilter);
        const res = await partnerApi<PaginatedResponse<Consignment>>(
          `/documents/consignments?${params}`
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
  }, [page, branchFilter]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Consignments</h1>
        <PartnerBranchFilter value={branchFilter} onChange={(v) => { setBranchFilter(v); setPage(1); }} />
      </div>

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
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
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
          <ActionMenu
            items={[
              {
                label: 'Download PDF',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                onClick: async () => {
                  const token = getPartnerToken();
                  const res = await fetch(`/api/v1/partner-portal/documents/consignments/${consignment.id}/proforma-pdf`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                },
              },
              {
                label: 'Print',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
                onClick: async () => {
                  const token = getPartnerToken();
                  const res = await fetch(`/api/v1/partner-portal/documents/consignments/${consignment.id}/proforma-pdf`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const w = window.open(url, '_blank');
                  w?.addEventListener('load', () => w.print());
                },
              },
              {
                label: 'Copy Waybill #',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                hidden: !consignment.courierWaybill,
                onClick: () => navigator.clipboard.writeText(consignment.courierWaybill ?? ''),
              },
              {
                label: 'Acknowledge Receipt',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
                hidden: consignment.status !== 'DISPATCHED' && consignment.status !== 'DELIVERED',
                onClick: async () => {
                  try {
                    await partnerApi(`/documents/consignments/${consignment.id}/acknowledge`, { method: 'POST' });
                    window.location.reload();
                  } catch { /* handled by partnerApi */ }
                },
              },
              {
                label: 'Report Issue',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
                hidden: consignment.status !== 'DISPATCHED' && consignment.status !== 'DELIVERED' && consignment.status !== 'RECEIVED',
                variant: 'danger',
                onClick: () => window.location.assign('/partner/returns/new'),
              },
            ]}
          />
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
