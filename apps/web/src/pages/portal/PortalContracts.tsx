import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';

interface Contract {
  id: string;
  titleId: string;
  royaltyRatePrint: string;
  royaltyRateEbook: string | null;
  advanceAmount: string;
  advanceRecovered: string;
  isSigned: boolean;
  signedAt: string | null;
  startDate: string;
  endDate: string | null;
  contractTermsSnapshot: string | null;
  contractTemplateId: string | null;
  title: { title: string; isbn13: string | null };
  template: { name: string; authorType: string } | null;
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
          const hasTerms = !!(c.contractTermsSnapshot || c.contractTemplateId);

          return (
            <Link
              key={c.id}
              to={`/portal/contracts/${c.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{c.title?.title ?? 'Unknown Title'}</h3>
                <div className="flex items-center gap-2">
                  {c.isSigned ? (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                      Signed {c.signedAt ? new Date(c.signedAt).toLocaleDateString() : ''}
                    </span>
                  ) : hasTerms ? (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                      Awaiting Signature
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                      Draft
                    </span>
                  )}
                </div>
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
                <div>
                  <p className="text-xs text-gray-500">Start Date</p>
                  <p className="font-medium">{new Date(c.startDate).toLocaleDateString()}</p>
                </div>
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

              {hasTerms && !c.isSigned && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  This contract has terms ready for your review and signature. Click to view and sign.
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
