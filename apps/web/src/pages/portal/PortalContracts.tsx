import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';

interface Contract {
  id: string;
  title: string;
  advanceAmount: string;
  advanceRecovered: string;
  advanceRemaining: number;
  royaltyRatePrint: string;
  royaltyRateEbook: string | null;
  status: string;
  signedDate: string | null;
}

export function PortalContracts() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-contracts'],
    queryFn: () => api<{ data: Contract[] }>('/portal/contracts'),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const contracts = data?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Contracts</h1>

      <div className="space-y-4">
        {contracts.map((c) => {
          const advance = Number(c.advanceAmount);
          const recovered = Number(c.advanceRecovered);
          const pct = advance > 0 ? Math.min(100, (recovered / advance) * 100) : 100;

          return (
            <Link
              key={c.id}
              to={`/portal/contracts/${c.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{c.title}</h3>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {c.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-3">
                <div>
                  <p className="text-xs text-gray-500">Print Royalty</p>
                  <p className="font-medium">{(Number(c.royaltyRatePrint) * 100).toFixed(1)}%</p>
                </div>
                {c.royaltyRateEbook && (
                  <div>
                    <p className="text-xs text-gray-500">E-book Royalty</p>
                    <p className="font-medium">{(Number(c.royaltyRateEbook) * 100).toFixed(1)}%</p>
                  </div>
                )}
                {c.signedDate && (
                  <div>
                    <p className="text-xs text-gray-500">Signed</p>
                    <p className="font-medium">{new Date(c.signedDate).toLocaleDateString()}</p>
                  </div>
                )}
                {advance > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">Advance</p>
                    <p className="font-medium">R {advance.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {advance > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Advance Recovery</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
        {contracts.length === 0 && (
          <p className="text-sm text-gray-500">No contracts found.</p>
        )}
      </div>
    </div>
  );
}
