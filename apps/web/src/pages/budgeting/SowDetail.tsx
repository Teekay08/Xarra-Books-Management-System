import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface SowDeliverable {
  id: string;
  description: string;
  dueDate: string | null;
  acceptanceCriteria: string | null;
}

interface SowMilestone {
  id: string;
  name: string;
  date: string;
}

interface SowCostLine {
  id: string;
  description: string;
  hours: string;
  rate: string;
  total: string;
}

interface SowVersion {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string | null;
  changeNotes: string | null;
}

interface SowDocument {
  id: string;
  number: string;
  status: string;
  version: number;
  totalAmount: string;
  scope: string;
  terms: string | null;
  validUntil: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  project?: { id: string; name: string; number: string } | null;
  contractor?: { id: string; name: string; contactEmail?: string | null } | null;
  staffUser?: { id: string; name: string } | null;
  deliverables: SowDeliverable[];
  milestones: SowMilestone[];
  costBreakdown: SowCostLine[];
  timeline?: { startDate?: string; endDate?: string; milestones?: Array<{ name: string; date: string }> } | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function SowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sow-document', id],
    queryFn: () => api<{ data: SowDocument }>(`/budgeting/sow/${id}`),
  });

  const { data: versionsData } = useQuery({
    queryKey: ['sow-versions', id],
    queryFn: () => api<{ data: SowVersion[] }>(`/budgeting/sow/${id}/versions`),
  });

  const sendMutation = useMutation({
    mutationFn: (email: string) =>
      api(`/budgeting/sow/${id}/email`, {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: email }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sow-document', id] });
      setShowSendModal(false);
      setSuccessMsg(`SOW sent successfully to ${sendEmail}`);
      setSendEmail('');
      setTimeout(() => setSuccessMsg(''), 5000);
    },
    onError: (err: Error) => alert(`Failed to send SOW: ${err.message}`),
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      api(`/budgeting/sow/${id}/accept`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sow-document', id] }),
    onError: (err: Error) => alert(`Failed to accept SOW: ${err.message}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">SOW not found</div>;

  const sow = data.data;
  const assigneeName = sow.contractor?.name || sow.staffUser?.name || sow.scope?.match(/Statement of Work for (.+?) on project/)?.[1] || '—';
  const assigneeType = sow.contractor ? 'Contractor' : 'Staff Member';
  const versions = versionsData?.data ?? [];
  const costBreakdown = sow.costBreakdown || [];
  const deliverables = sow.deliverables || [];
  const timeline = sow.timeline || { startDate: null, endDate: null, milestones: [] };
  const costGrandTotal = costBreakdown.reduce((s: number, c: any) => s + Number(c.total || 0), 0);

  const wasRegenerated = sow.version > 1 && sow.status === 'DRAFT';

  return (
    <div>
      {wasRegenerated && (
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-medium">SOW updated from tasks (v{sow.version})</p>
          <p className="text-xs">
            This SOW was automatically regenerated because tasks for this staff member were added or changed. Re-send it for acceptance.
          </p>
        </div>
      )}
      <PageHeader
        title={sow.number}
        subtitle={sow.project?.name || 'Statement of Work'}
        backTo={{ label: 'Back to Statements of Work', href: '/budgeting/sow' }}
        action={
          <div className="flex gap-2">
            {sow.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => {
                    setSendEmail(sow.contractor?.contactEmail || '');
                    setShowSendModal(true);
                  }}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Send
                </button>
              </>
            )}
            {sow.status === 'SENT' && (
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {acceptMutation.isPending ? 'Accepting...' : 'Mark as Accepted'}
              </button>
            )}
          </div>
        }
      />

      {successMsg && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">{successMsg}</div>
      )}

      <div className="max-w-4xl space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Number</p>
            <p className="mt-1 text-sm font-mono font-medium text-gray-900">{sow.number}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Project</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{sow.project?.name || '—'}</p>
            {sow.project?.number && (
              <p className="text-xs text-gray-400">{sow.project.number}</p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Assigned To</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{assigneeName}</p>
            <p className="text-xs text-gray-400">{assigneeType}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Total Amount</p>
            <p className="mt-1 text-lg font-bold text-gray-900">R {Number(sow.totalAmount).toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Version</p>
            <p className="mt-1 text-sm font-medium text-gray-900">v{sow.version}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Status</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[sow.status] || ''}`}>
              {sow.status}
            </span>
          </div>
        </div>

        {/* Scope */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Scope</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{sow.scope}</p>
        </div>

        {/* Deliverables */}
        {deliverables.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-gray-900">Deliverables</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acceptance Criteria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deliverables.map((d: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm text-gray-900">{d.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {d.dueDate ? new Date(d.dueDate).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{d.acceptanceCriteria || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Timeline</h3>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <span className="text-gray-500">Start Date</span>
              <p className="font-medium">
                {timeline.startDate ? new Date(timeline.startDate).toLocaleDateString('en-ZA') : '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">End Date</span>
              <p className="font-medium">
                {timeline.endDate ? new Date(timeline.endDate).toLocaleDateString('en-ZA') : '—'}
              </p>
            </div>
          </div>
          {(timeline.milestones?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2">Milestones</p>
              <div className="space-y-2">
                {(timeline.milestones || []).map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-900">{m.name}</span>
                    <span className="text-sm text-gray-500">{m.date ? new Date(m.date).toLocaleDateString('en-ZA') : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost Breakdown */}
        {costBreakdown.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-gray-900">Cost Breakdown</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {costBreakdown.map((c: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm text-gray-900">{c.description}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{Number(c.hours).toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">R {Number(c.rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">R {Number(c.total).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-4 py-3 text-sm text-gray-900 text-right">Grand Total:</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">R {costGrandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Terms */}
        {sow.terms && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Terms</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{sow.terms}</p>
          </div>
        )}

        {/* Valid Until */}
        {sow.validUntil && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="text-sm">
              <span className="text-gray-500">Valid Until: </span>
              <span className="font-medium">{new Date(sow.validUntil).toLocaleDateString('en-ZA')}</span>
            </div>
          </div>
        )}

        {/* Notes */}
        {sow.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{sow.notes}</p>
          </div>
        )}

        {/* Version History */}
        {versions.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">v{v.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(v.createdAt).toLocaleDateString('en-ZA')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{v.createdBy || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{v.changeNotes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Send SOW</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <input
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="contractor@example.com"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowSendModal(false); setSendEmail(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => sendEmail && sendMutation.mutate(sendEmail)}
                disabled={!sendEmail || sendMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sendMutation.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
