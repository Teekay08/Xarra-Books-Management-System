import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { partnerApi, getPartnerUser } from '../../lib/partner-api';

interface BranchSummary {
  id: string;
  name: string;
  code: string | null;
  ordersLast30Days: number;
  pendingReturns: number;
  lastOrderDate: string | null;
}

export function PartnerBranchActivity() {
  const user = getPartnerUser();
  const isHq = !user?.branchId;

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isHq) return;
    async function fetchData() {
      try {
        const res = await partnerApi<{ data: BranchSummary[] }>('/branches/activity-summary');
        setBranches(res.data);
      } catch {
        // handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isHq]);

  if (!isHq) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Branch activity is only available for head office users.</p>
      </div>
    );
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Branch Activity</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of activity across all your branches.
        </p>
      </div>

      {branches.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No branches configured for your organisation.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="rounded-lg border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{branch.name}</h3>
                  {branch.code && (
                    <p className="text-xs text-gray-400 font-mono">{branch.code}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Orders (30 days)</span>
                  <span className="text-sm font-medium text-gray-900">
                    {branch.ordersLast30Days}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Pending Returns</span>
                  <span
                    className={`text-sm font-medium ${branch.pendingReturns > 0 ? 'text-amber-600' : 'text-gray-900'}`}
                  >
                    {branch.pendingReturns}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Order</span>
                  <span className="text-sm text-gray-500">
                    {branch.lastOrderDate
                      ? new Date(branch.lastOrderDate).toLocaleDateString('en-ZA', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                <Link
                  to={`/partner/orders?branchId=${branch.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View Orders
                </Link>
                <span className="text-gray-300">|</span>
                <Link
                  to={`/partner/returns?branchId=${branch.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View Returns
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
