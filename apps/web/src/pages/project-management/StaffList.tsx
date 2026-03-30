import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  skills: string[];
  availabilityType: string;
  maxHoursPerWeek: number;
  hourlyRate: string;
  isInternal: boolean;
  isActive: boolean;
  userId: string | null;
  notes: string | null;
}

const availabilityLabels: Record<string, string> = {
  FULL_TIME: 'Full-Time',
  PART_TIME: 'Part-Time',
  CONTRACT: 'Contract',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
};

export function StaffList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pm-staff', page, search],
    queryFn: () =>
      api<{ data: StaffMember[]; pagination: { page: number; totalPages: number; total: number } }>(
        `/project-management/staff?page=${page}&limit=20&search=${search}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Staff Members"
        subtitle="Manage team members and freelancers"
        action={
          <Link to="/pm/staff/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Add Staff
          </Link>
        }
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or skill..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Skills</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {data?.data?.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/pm/staff/${s.id}/edit`)}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {s.name}
                  {s.isInternal && <span className="ml-1 text-xs text-blue-600">(Internal)</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.email}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{s.role}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {s.skills?.slice(0, 3).map((sk) => (
                      <span key={sk} className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {sk.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {s.skills?.length > 3 && (
                      <span className="text-xs text-gray-400">+{s.skills.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{availabilityLabels[s.availabilityType] || s.availabilityType}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">R {Number(s.hourlyRate).toFixed(2)}/hr</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.isActive ? statusColors['ACTIVE'] : statusColors['INACTIVE']}`}>
                    {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    { label: 'Edit', onClick: () => navigate(`/pm/staff/${s.id}/edit`) },
                    { label: 'Deactivate', onClick: () => navigate(`/pm/staff/${s.id}/edit`), variant: 'danger', hidden: !s.isActive },
                  ]} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No staff members found. Add your first team member.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)</p>
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
