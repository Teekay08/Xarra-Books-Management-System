import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || res.statusText);
  }
  return res.json();
}

export function SowReview() {
  const { id } = useParams();
  const [accepted, setAccepted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sow-public', id],
    queryFn: () => publicApi<{ data: any }>(`/budgeting/sow/${id}/public-view`),
    enabled: !!id,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => publicApi(`/budgeting/sow/${id}/accept-public`, { method: 'POST' }),
    onSuccess: () => {
      setAccepted(true);
      setConfirmOpen(false);
    },
    onError: (err: Error) => alert(`Failed to accept SOW: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading Statement of Work...</p>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="mb-4 text-5xl">📄</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">SOW Not Found</h1>
          <p className="text-gray-500 text-sm">
            This link may be invalid or the SOW has been cancelled. Please contact Xarra Books for assistance.
          </p>
        </div>
      </div>
    );
  }

  const sow = data.data;
  const costBreakdown = sow.costBreakdown ?? [];
  const deliverables = sow.deliverables ?? [];
  const timeline = sow.timeline ?? {};
  const costTotal = costBreakdown.reduce((s: number, c: any) => s + Number(c.total || 0), 0);
  const canAccept = sow.status === 'SENT' && !accepted;

  const statusBadge = accepted || sow.status === 'ACCEPTED'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">✓ Accepted</span>
    : sow.status === 'SENT'
    ? <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">Awaiting Acceptance</span>
    : <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{sow.status}</span>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 print:hidden">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-green-800">Xarra Books</h1>
            <p className="text-xs text-gray-400">Statement of Work</p>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge}
            {canAccept && (
              <button
                onClick={() => setConfirmOpen(true)}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                Accept SOW
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {(accepted || sow.status === 'ACCEPTED') && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-green-800 font-semibold">✓ This Statement of Work has been accepted.</p>
            {sow.acceptedAt && (
              <p className="text-green-700 text-sm mt-1">
                Accepted on {new Date(sow.acceptedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {canAccept && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-blue-900 text-sm font-medium">Please review this Statement of Work carefully.</p>
            <p className="text-blue-700 text-sm mt-1">
              Once you accept, you confirm agreement to the scope, deliverables, timeline, and payment terms described below.
              {sow.validUntil && ` This offer expires on ${new Date(sow.validUntil).toLocaleDateString('en-ZA')}.`}
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Reference</p>
            <p className="mt-1 text-sm font-mono font-semibold text-gray-900">{sow.number}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Project</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{sow.project?.name}</p>
            {sow.project?.number && <p className="text-xs text-gray-400">{sow.project.number}</p>}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Contract Value</p>
            <p className="mt-1 text-lg font-bold text-gray-900">R {Number(sow.totalAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Valid Until</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {sow.validUntil ? new Date(sow.validUntil).toLocaleDateString('en-ZA') : '—'}
            </p>
          </div>
        </div>

        {/* Scope */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Scope of Work</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{sow.scope}</p>
        </div>

        {/* Deliverables */}
        {deliverables.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Deliverables</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acceptance Criteria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deliverables.map((d: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
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
        {(timeline.startDate || timeline.endDate) && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Timeline</h2>
            <div className="flex gap-8 mb-4">
              <div>
                <p className="text-xs text-gray-500">Start Date</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {timeline.startDate ? new Date(timeline.startDate).toLocaleDateString('en-ZA') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">End Date</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {timeline.endDate ? new Date(timeline.endDate).toLocaleDateString('en-ZA') : '—'}
                </p>
              </div>
            </div>
            {(timeline.milestones ?? []).length > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {(timeline.milestones as any[]).map((m: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-800">{m.name}</span>
                    <span className="text-gray-500">{m.date ? new Date(m.date).toLocaleDateString('en-ZA') : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cost */}
        {costBreakdown.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Cost Breakdown</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {costBreakdown.map((c: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-sm text-gray-900">{c.description}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{Number(c.hours).toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">R {Number(c.rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">R {Number(c.total).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-green-50">
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Total Contract Value</td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-green-800">R {costTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Terms */}
        {sow.terms && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Terms & Conditions</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{sow.terms}</p>
          </div>
        )}

        {/* Accept button bottom */}
        {canAccept && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setConfirmOpen(true)}
              className="rounded-lg bg-green-700 px-8 py-3 text-base font-semibold text-white hover:bg-green-800 shadow-sm"
            >
              Accept This Statement of Work
            </button>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          Questions? Contact Xarra Books at <a href="mailto:info@xarrabooks.com" className="underline">info@xarrabooks.com</a>
        </div>
      </main>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Acceptance</h3>
            <p className="text-sm text-gray-600">
              By clicking <strong>Accept</strong> you confirm that you have read and agree to all the terms,
              scope, deliverables, and payment conditions in Statement of Work <strong>{sow.number}</strong> for
              a total value of <strong>R {Number(sow.totalAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Review Again
              </button>
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="rounded-md bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {acceptMutation.isPending ? 'Accepting...' : 'Accept SOW'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
