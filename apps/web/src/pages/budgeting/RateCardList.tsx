import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface RateCard {
  id: string;
  name: string;
  type: string;
  role: string;
  hourlyRateZar: string;
  dailyRateZar: string | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  staffUser?: { name: string } | null;
  supplier?: { name: string } | null;
}

export function RateCardList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rate-cards', page, search],
    queryFn: () =>
      api<{ data: RateCard[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/budgeting/rate-cards?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Rate Cards"
        subtitle="Manage hourly rates for internal staff and external contractors"
        action={
          <Link to="/budgeting/rate-cards/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            New Rate Card
          </Link>
        }
      />

      <div className="mb-4">
        <input type="text" placeholder="Search rate cards..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hourly Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Daily Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Linked To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((rc) => (
              <tr key={rc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{rc.name}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rc.type === 'INTERNAL' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {rc.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{rc.role}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">R {Number(rc.hourlyRateZar).toFixed(2)}/hr</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">
                  {rc.dailyRateZar ? `R ${Number(rc.dailyRateZar).toFixed(2)}/day` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {rc.staffUser?.name || rc.supplier?.name || '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rc.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {rc.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <ActionMenu items={[
                    { label: 'Edit', onClick: () => navigate(`/budgeting/rate-cards/${rc.id}/edit`) },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No rate cards yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
