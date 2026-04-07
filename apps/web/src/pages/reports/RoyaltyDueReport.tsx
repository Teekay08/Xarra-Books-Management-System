import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { formatR } from '../../lib/format';
import { downloadCsv } from '../../lib/export';
import { ExportButton } from '../../components/ExportButton';

interface AuthorSchedule {
  authorId: string;
  authorName: string;
  contractCount: number;
  awaitingPayment: number;    // APPROVED entries — ready to pay
  pendingApproval: number;    // CALCULATED entries — need approval first
  totalOutstanding: number;
  nextPaymentDue: string | null;
  isOverdue: boolean;
}

export function RoyaltyDueReport() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['royalty-payment-schedule'],
    queryFn: () => api<{ data: AuthorSchedule[] }>('/royalties/payment-schedule'),
  });

  const authors = (data?.data ?? []).filter((a) => a.totalOutstanding > 0);
  const overdue = authors.filter((a) => a.isOverdue);
  const totalPayable = authors.reduce((s, a) => s + a.totalOutstanding, 0);
  const totalApproved = authors.reduce((s, a) => s + a.awaitingPayment, 0);
  const totalPending = authors.reduce((s, a) => s + a.pendingApproval, 0);

  return (
    <div>
      <PageHeader
        title="Royalty Due Report"
        subtitle="All authors with outstanding royalty payments — approved and pending approval"
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Authors with Pending</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{authors.length}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700 uppercase">Overdue</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{overdue.length}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-700 uppercase">Approved &amp; Ready</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatR(totalApproved)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Outstanding</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatR(totalPayable)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {authors.length > 0
            ? `${authors.length} author${authors.length !== 1 ? 's' : ''} with outstanding royalties`
            : 'No outstanding royalties'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/royalties')}
            className="rounded-md bg-green-700 px-3 py-2 text-xs font-medium text-white hover:bg-green-800"
          >
            Manage Royalties
          </button>
          <ExportButton options={[
            { label: 'Export CSV', onClick: () => {
              if (authors.length > 0) {
                downloadCsv(authors, [
                  { key: 'authorName', header: 'Author' },
                  { key: 'pendingApproval', header: 'Pending Approval (R)' },
                  { key: 'awaitingPayment', header: 'Approved / Ready (R)' },
                  { key: 'totalOutstanding', header: 'Total Outstanding (R)' },
                  { key: 'nextPaymentDue', header: 'Next Due Date' },
                  { key: 'isOverdue', header: 'Overdue' },
                ], 'royalty-due-report');
              }
            }},
          ]} />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : authors.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
          No pending royalty payments across all authors
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending Approval</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Approved / Ready</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {authors
                .sort((a, b) => {
                  if (a.isOverdue && !b.isOverdue) return -1;
                  if (!a.isOverdue && b.isOverdue) return 1;
                  return b.totalOutstanding - a.totalOutstanding;
                })
                .map((author) => (
                  <tr
                    key={author.authorId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/reports/author-royalty?authorId=${author.authorId}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{author.authorName}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-700">
                      {author.pendingApproval > 0 ? formatR(author.pendingApproval) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      {author.awaitingPayment > 0 ? formatR(author.awaitingPayment) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {formatR(author.totalOutstanding)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {author.nextPaymentDue
                        ? new Date(author.nextPaymentDue).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium border ${
                        author.isOverdue
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {author.isOverdue ? 'Overdue' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right font-mono text-amber-700">{formatR(totalPending)}</td>
                <td className="px-4 py-3 text-right font-mono text-green-700">{formatR(totalApproved)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatR(totalPayable)}</td>
                <td className="px-4 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
