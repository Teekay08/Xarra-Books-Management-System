import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface DashboardData {
  author: { legalName: string; penName: string | null; type: string };
  stats: { totalEarned: number; totalPaid: number; totalOutstanding: number; totalUnitsSold: number };
  contracts: {
    id: string;
    title: string;
    advanceAmount: string;
    advanceRecovered: string;
    advanceRemaining: number;
    royaltyRatePrint: string;
  }[];
}

export function PortalDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: () => api<{ data: DashboardData }>('/portal/dashboard'),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Author profile not found. Contact administrator.</div>;

  const { author, stats, contracts } = data.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {author.penName ?? author.legalName}</h1>
        <p className="text-sm text-gray-500 mt-1">{author.type} Author</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Earned" value={`R ${stats.totalEarned.toFixed(2)}`} />
        <StatCard label="Total Paid" value={`R ${stats.totalPaid.toFixed(2)}`} color="green" />
        <StatCard label="Outstanding" value={`R ${stats.totalOutstanding.toFixed(2)}`} color="amber" />
        <StatCard label="Units Sold" value={stats.totalUnitsSold.toLocaleString()} />
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Contracts</h2>
      <div className="space-y-4">
        {contracts.map((c) => {
          const advance = Number(c.advanceAmount);
          const recovered = Number(c.advanceRecovered);
          const pct = advance > 0 ? Math.min(100, (recovered / advance) * 100) : 100;

          return (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{c.title}</h3>
                <span className="text-sm text-gray-500">Royalty: {(Number(c.royaltyRatePrint) * 100).toFixed(1)}%</span>
              </div>
              {advance > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Advance Recovery</span>
                    <span>R {recovered.toFixed(2)} / R {advance.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {c.advanceRemaining > 0 && (
                    <p className="text-xs text-amber-600 mt-1">R {c.advanceRemaining.toFixed(2)} remaining</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {contracts.length === 0 && (
          <p className="text-sm text-gray-500">No contracts found.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const textColor = color === 'green' ? 'text-green-600' : color === 'amber' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textColor}`}>{value}</p>
    </div>
  );
}
