import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';

interface DashboardStats {
  totalTitles: number;
  activeAuthors: number;
  activePartners: number;
  totalStock: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api<{ data: DashboardStats }>('/dashboard/stats'),
  });

  const stats = data?.data;

  const cards = [
    { label: 'Total Titles', value: stats?.totalTitles, color: 'bg-blue-50 text-blue-700', link: '/titles' },
    { label: 'Active Authors', value: stats?.activeAuthors, color: 'bg-green-50 text-green-700', link: '/authors' },
    { label: 'Channel Partners', value: stats?.activePartners, color: 'bg-amber-50 text-amber-700', link: '/partners' },
    { label: 'Total Stock', value: stats?.totalStock, color: 'bg-purple-50 text-purple-700', link: '/inventory' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Xarra Books Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((stat) => (
          <div
            key={stat.label}
            onClick={() => navigate(stat.link)}
            className={`rounded-lg p-6 ${stat.color} cursor-pointer hover:opacity-80 transition-opacity`}
          >
            <p className="text-sm font-medium opacity-80">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">
              {isLoading ? '...' : stat.value ?? 0}
            </p>
          </div>
        ))}
      </div>

      {!isLoading && stats?.totalTitles === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-400">
          <p className="text-lg font-medium">System is ready</p>
          <p className="text-sm mt-2">Start by adding authors and titles in the sidebar.</p>
        </div>
      )}
    </div>
  );
}
