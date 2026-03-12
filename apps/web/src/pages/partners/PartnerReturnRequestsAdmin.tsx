import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { ActionMenu } from '../../components/ActionMenu';

interface ReturnLine {
  id: string;
  titleId: string;
  title: { title: string; isbn: string };
  quantityRequested: number;
  condition: string;
  quantityAccepted: number | null;
}

interface ReturnRequest {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: string;
  notes: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  inspectionNotes: string | null;
  creditNoteId: string | null;
  partner: { id: string; name: string };
  branch: { id: string; name: string } | null;
  requestedBy: { name: string } | null;
  lines: ReturnLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-yellow-100 text-yellow-700',
  AUTHORIZED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-600',
  RECEIVED: 'bg-indigo-100 text-indigo-700',
  INSPECTED: 'bg-purple-100 text-purple-700',
  CREDITED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

export function PartnerReturnRequestsAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<ReturnRequest | null>(null);

  // Review form
  const [reviewAction, setReviewAction] = useState<'authorize' | 'reject'>('authorize');
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReview, setShowReview] = useState(false);

  // Inspect form
  const [showInspect, setShowInspect] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [inspectLines, setInspectLines] = useState<{ lineId: string; qtyAccepted: number }[]>([]);

  // Credit form
  const [showCredit, setShowCredit] = useState(false);
  const [creditNoteId, setCreditNoteId] = useState('');

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['partner-admin-return-requests', page, search, statusFilter],
    queryFn: () =>
      api<PaginatedResponse<ReturnRequest>>(
        `/partner-admin/return-requests?${queryParams.toString()}`
      ),
  });

  const detailQuery = useQuery({
    queryKey: ['partner-admin-return-request', selected?.id],
    queryFn: () => api<{ data: ReturnRequest }>(`/partner-admin/return-requests/${selected!.id}`),
    enabled: !!selected,
  });

  const detail = detailQuery.data?.data ?? selected;

  const reviewMut = useMutation({
    mutationFn: (body: { action: string; reviewNotes: string; rejectionReason?: string }) =>
      api(`/partner-admin/return-requests/${selected!.id}/review`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateAll();
      setShowReview(false);
    },
  });

  const receiveMut = useMutation({
    mutationFn: () =>
      api(`/partner-admin/return-requests/${selected!.id}/receive`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidateAll,
  });

  const inspectMut = useMutation({
    mutationFn: (body: { inspectionNotes: string; lines: { lineId: string; qtyAccepted: number }[] }) =>
      api(`/partner-admin/return-requests/${selected!.id}/inspect`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateAll();
      setShowInspect(false);
    },
  });

  const creditMut = useMutation({
    mutationFn: (body: { creditNoteId: string }) =>
      api(`/partner-admin/return-requests/${selected!.id}/credit`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateAll();
      setShowCredit(false);
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['partner-admin-return-requests'] });
    queryClient.invalidateQueries({ queryKey: ['partner-admin-return-request', selected?.id] });
  }

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  function openDetail(req: ReturnRequest) {
    setSelected(req);
    setShowReview(false);
    setShowInspect(false);
    setShowCredit(false);
  }

  function openInspect() {
    if (!detail) return;
    setInspectionNotes('');
    setInspectLines(
      detail.lines.map((l) => ({ lineId: l.id, qtyAccepted: l.quantityAccepted ?? l.quantityRequested }))
    );
    setShowInspect(true);
  }

  const columns = [
    {
      key: 'requestNumber',
      header: 'Request #',
      render: (r: ReturnRequest) => (
        <span className="font-medium text-green-700">{r.requestNumber}</span>
      ),
    },
    { key: 'partner', header: 'Partner', render: (r: ReturnRequest) => r.partner.name },
    { key: 'branch', header: 'Branch', render: (r: ReturnRequest) => r.branch?.name ?? '—' },
    {
      key: 'createdAt',
      header: 'Date',
      render: (r: ReturnRequest) => new Date(r.createdAt).toLocaleDateString(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: ReturnRequest) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Requested By',
      render: (r: ReturnRequest) => r.requestedBy?.name ?? '—',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: ReturnRequest) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={[
            { label: 'View Details', onClick: () => openDetail(r) },
            { label: 'Review', onClick: () => { openDetail(r); setTimeout(() => { setReviewAction('authorize'); setReviewNotes(''); setRejectionReason(''); setShowReview(true); }, 0); }, hidden: r.status !== 'SUBMITTED' },
            { label: 'Receive', onClick: () => { setSelected(r); setTimeout(() => receiveMut.mutate(), 0); }, hidden: r.status !== 'AUTHORIZED' },
            { label: 'Inspect', onClick: () => { openDetail(r); setTimeout(openInspect, 100); }, hidden: r.status !== 'RECEIVED' },
            { label: 'Link Credit Note', onClick: () => { openDetail(r); setTimeout(() => { setCreditNoteId(''); setShowCredit(true); }, 0); }, hidden: r.status !== 'INSPECTED' || !!r.creditNoteId },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Partner Return Requests" subtitle="Review and process partner return requests" />

      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={handleSearch} placeholder="Search by request number or partner..." />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">All Statuses</option>
          {Object.keys(statusColors).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={openDetail}
            emptyMessage="No return requests found"
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Return Request {detail?.requestNumber}
              </h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                Close
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="py-8 text-center text-gray-400">Loading details...</div>
            ) : detail ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Partner:</span>{' '}
                    <span className="font-medium">{detail.partner.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Branch:</span>{' '}
                    <span className="font-medium">{detail.branch?.name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[detail.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {detail.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Requested By:</span>{' '}
                    {detail.requestedBy?.name ?? '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span>{' '}
                    {new Date(detail.createdAt).toLocaleDateString()}
                  </div>
                  {detail.creditNoteId && (
                    <div>
                      <span className="text-gray-500">Credit Note:</span>{' '}
                      <span className="font-medium">{detail.creditNoteId}</span>
                    </div>
                  )}
                </div>

                {detail.notes && (
                  <div className="text-sm">
                    <span className="text-gray-500">Notes:</span> {detail.notes}
                  </div>
                )}
                {detail.reviewNotes && (
                  <div className="text-sm">
                    <span className="text-gray-500">Review Notes:</span> {detail.reviewNotes}
                  </div>
                )}
                {detail.rejectionReason && (
                  <div className="text-sm">
                    <span className="text-gray-500">Rejection Reason:</span> {detail.rejectionReason}
                  </div>
                )}
                {detail.inspectionNotes && (
                  <div className="text-sm">
                    <span className="text-gray-500">Inspection Notes:</span> {detail.inspectionNotes}
                  </div>
                )}

                {/* Line Items */}
                {detail.lines && detail.lines.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">Line Items</h4>
                    <div className="overflow-hidden rounded border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Requested</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Accepted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {detail.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-2">{line.title?.title ?? line.titleId}</td>
                              <td className="px-3 py-2 text-right">{line.quantityRequested}</td>
                              <td className="px-3 py-2">{line.condition}</td>
                              <td className="px-3 py-2 text-right">{line.quantityAccepted ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {detail.status === 'SUBMITTED' && (
                    <button
                      onClick={() => {
                        setReviewAction('authorize');
                        setReviewNotes('');
                        setRejectionReason('');
                        setShowReview(true);
                      }}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Review
                    </button>
                  )}
                  {detail.status === 'AUTHORIZED' && (
                    <button
                      onClick={() => receiveMut.mutate()}
                      disabled={receiveMut.isPending}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {receiveMut.isPending ? 'Receiving...' : 'Receive'}
                    </button>
                  )}
                  {detail.status === 'RECEIVED' && (
                    <button
                      onClick={openInspect}
                      className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      Inspect
                    </button>
                  )}
                  {detail.status === 'INSPECTED' && !detail.creditNoteId && (
                    <>
                      <button
                        onClick={() => {
                          setCreditNoteId('');
                          setShowCredit(true);
                        }}
                        className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                      >
                        Link Credit Note
                      </button>
                    </>
                  )}
                  {detail.creditNoteId && (
                    <button
                      onClick={() => navigate(`/finance/credit-notes`)}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                    >
                      View Credit Note
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Review Return Request</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                reviewMut.mutate({
                  action: reviewAction,
                  reviewNotes,
                  ...(reviewAction === 'reject' && { rejectionReason }),
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Action</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reviewAction"
                      value="authorize"
                      checked={reviewAction === 'authorize'}
                      onChange={() => setReviewAction('authorize')}
                      className="text-green-700"
                    />
                    Authorize
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reviewAction"
                      value="reject"
                      checked={reviewAction === 'reject'}
                      onChange={() => setReviewAction('reject')}
                      className="text-red-600"
                    />
                    Reject
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              {reviewAction === 'reject' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Rejection Reason</label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              )}
              {reviewMut.isError && (
                <p className="text-sm text-red-600">{reviewMut.error?.message ?? 'An error occurred'}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReview(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewMut.isPending}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    reviewAction === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {reviewMut.isPending
                    ? 'Saving...'
                    : reviewAction === 'authorize'
                      ? 'Authorize'
                      : 'Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {showInspect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Inspect Return Items</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                inspectMut.mutate({ inspectionNotes, lines: inspectLines });
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Inspection Notes</label>
                <textarea
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-700">Quantity Accepted per Line</h4>
                <div className="space-y-2">
                  {detail?.lines.map((line, idx) => (
                    <div key={line.id} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 truncate">{line.title?.title ?? line.titleId}</span>
                      <span className="text-gray-500">Req: {line.quantityRequested}</span>
                      <input
                        type="number"
                        min={0}
                        max={line.quantityRequested}
                        value={inspectLines[idx]?.qtyAccepted ?? 0}
                        onChange={(e) => {
                          setInspectLines((prev) => {
                            const next = [...prev];
                            next[idx] = { lineId: line.id, qtyAccepted: Number(e.target.value) };
                            return next;
                          });
                        }}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-right focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {inspectMut.isError && (
                <p className="text-sm text-red-600">{inspectMut.error?.message ?? 'An error occurred'}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInspect(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inspectMut.isPending}
                  className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {inspectMut.isPending ? 'Saving...' : 'Submit Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Note Modal */}
      {showCredit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Link Credit Note</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                creditMut.mutate({ creditNoteId });
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Credit Note ID</label>
                <input
                  type="text"
                  value={creditNoteId}
                  onChange={(e) => setCreditNoteId(e.target.value)}
                  required
                  placeholder="Paste credit note ID"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Create a credit note from the partner's invoice first, then paste its ID here.
                </p>
              </div>
              {creditMut.isError && (
                <p className="text-sm text-red-600">{creditMut.error?.message ?? 'An error occurred'}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCredit(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creditMut.isPending || !creditNoteId}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {creditMut.isPending ? 'Linking...' : 'Link Credit Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
