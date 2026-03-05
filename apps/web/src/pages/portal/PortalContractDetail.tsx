import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface ContractDetail {
  id: string;
  title: string;
  isbn: string | null;
  format: string;
  status: string;
  signedDate: string | null;
  advanceAmount: string;
  advanceRecovered: string;
  advanceRemaining: number;
  royaltyRatePrint: string;
  royaltyRateEbook: string | null;
  royaltyTriggerType: string;
  royaltyTriggerValue: string | null;
  recentRoyalties: {
    id: string;
    periodStart: string;
    periodEnd: string;
    unitsSold: number;
    netAmount: string;
    status: string;
  }[];
}

export function PortalContractDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['portal-contract', id],
    queryFn: () => api<{ data: ContractDetail }>(`/portal/contracts/${id}`),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Contract not found.</div>;

  const c = data.data;
  const advance = Number(c.advanceAmount);
  const recovered = Number(c.advanceRecovered);
  const pct = advance > 0 ? Math.min(100, (recovered / advance) * 100) : 100;

  return (
    <div>
      <Link to="/portal/contracts" className="text-sm text-green-700 hover:underline mb-4 inline-block">
        &larr; Back to Contracts
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{c.title}</h1>
      <div className="flex items-center gap-3 mb-6">
        {c.isbn && <span className="text-sm text-gray-500">ISBN: {c.isbn}</span>}
        <span className="text-sm text-gray-500">{c.format}</span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {c.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contract Terms</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Print Royalty Rate</dt>
              <dd className="font-medium">{(Number(c.royaltyRatePrint) * 100).toFixed(1)}%</dd>
            </div>
            {c.royaltyRateEbook && (
              <div className="flex justify-between">
                <dt className="text-gray-500">E-book Royalty Rate</dt>
                <dd className="font-medium">{(Number(c.royaltyRateEbook) * 100).toFixed(1)}%</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Trigger Type</dt>
              <dd className="font-medium">{c.royaltyTriggerType}</dd>
            </div>
            {c.signedDate && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Signed Date</dt>
                <dd className="font-medium">{new Date(c.signedDate).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>

        {advance > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Advance Recovery</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Advance</span>
                <span className="font-medium">R {advance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Recovered</span>
                <span className="font-medium text-green-600">R {recovered.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Remaining</span>
                <span className="font-medium text-amber-600">R {c.advanceRemaining.toFixed(2)}</span>
              </div>
              <div>
                <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-right">{pct.toFixed(1)}% recovered</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Royalty Entries</h2>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {c.recentRoyalties.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{r.unitsSold}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                  R {Number(r.netAmount).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'PAID'
                        ? 'bg-green-100 text-green-700'
                        : r.status === 'APPROVED'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {c.recentRoyalties.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  No royalty entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
