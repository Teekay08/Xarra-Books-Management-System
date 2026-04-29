import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface TimesheetEntry {
  id: string;
  milestoneId: string | null;
  workDate: string;
  hours: string;
  description: string;
  milestone?: { name: string } | null;
}

interface Timesheet {
  id: string;
  number: string;
  status: string;
  totalHours: string;
  periodFrom: string;
  periodTo: string;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  project?: { id: string; name: string; number: string } | null;
  worker?: { id: string; name: string } | null;
  entries: TimesheetEntry[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function TimesheetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['timesheet', id],
    queryFn: () => api<{ data: Timesheet }>(`/budgeting/timesheets/${id}`),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api(`/budgeting/timesheets/${id}/submit`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timesheet', id] }),
    onError: (err: Error) => alert(`Failed to submit: ${err.message}`),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      api(`/budgeting/timesheets/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timesheet', id] }),
    onError: (err: Error) => alert(`Failed to approve: ${err.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/budgeting/timesheets/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet', id] });
      setShowRejectModal(false);
      setRejectReason('');
    },
    onError: (err: Error) => alert(`Failed to reject: ${err.message}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Timesheet not found</div>;

  const ts = data.data;

  return (
    <div>
      <PageHeader
        title={ts.number}
        subtitle={ts.project?.name || 'Timesheet'}
        backTo={{ label: 'Back to Timesheets', href: '/budgeting/timesheets' }}
        action={
          <div className="flex gap-2">
            {ts.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </>
            )}
            {ts.status === 'SUBMITTED' && (
              <>
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="max-w-4xl space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Number</p>
            <p className="mt-1 text-sm font-mono font-medium text-gray-900">{ts.number}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Project</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{ts.project?.name || '—'}</p>
            {ts.project?.number && (
              <p className="text-xs text-gray-400">{ts.project.number}</p>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Worker</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{ts.worker?.name || '—'}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Period</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {new Date(ts.periodFrom).toLocaleDateString('en-ZA')} — {new Date(ts.periodTo).toLocaleDateString('en-ZA')}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Total Hours</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{Number(ts.totalHours).toFixed(1)}h</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Status</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[ts.status] || ''}`}>
              {ts.status}
            </span>
          </div>
        </div>

        {/* Entries Table */}
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ts.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">{entry.milestone?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{new Date(entry.workDate).toLocaleDateString('en-ZA')}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{Number(entry.hours).toFixed(1)}h</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{entry.description}</td>
                </tr>
              ))}
              {ts.entries.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No entries.</td></tr>
              )}
              {ts.entries.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={2} className="px-4 py-3 text-sm text-gray-900 text-right">Total:</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">
                    {ts.entries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)}h
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Approval info */}
        {ts.status === 'APPROVED' && ts.approvedAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">Approved</p>
            <p className="text-sm text-green-600 mt-1">
              {ts.approvedBy && <>By: {ts.approvedBy} &middot; </>}
              {new Date(ts.approvedAt).toLocaleDateString('en-ZA')}
            </p>
          </div>
        )}

        {/* Rejection info */}
        {ts.status === 'REJECTED' && ts.rejectedReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Rejected</p>
            <p className="text-sm text-red-600 mt-1">{ts.rejectedReason}</p>
            {ts.rejectedAt && (
              <p className="text-xs text-red-400 mt-1">{new Date(ts.rejectedAt).toLocaleDateString('en-ZA')}</p>
            )}
          </div>
        )}

        {/* Notes */}
        {ts.notes && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{ts.notes}</p>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reject Timesheet</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Provide a reason for rejection..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectReason && rejectMutation.mutate(rejectReason)}
                disabled={!rejectReason || rejectMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
