import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Partner {
  id: string;
  name: string;
  discountPct: string;
  contactName: string | null;
  contactEmail: string | null;
  isActive: boolean;
  paymentTermsDays: number | null;
}

export function PartnerList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['partners', page, search],
    queryFn: () =>
      api<PaginatedResponse<Partner>>(
        `/partners?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'name', header: 'Partner Name' },
    { key: 'discountPct', header: 'Discount', render: (p: Partner) => `${Number(p.discountPct)}%` },
    { key: 'contactName', header: 'Contact' },
    { key: 'contactEmail', header: 'Email' },
    { key: 'paymentTermsDays', header: 'Payment Terms', render: (p: Partner) =>
      p.paymentTermsDays ? `${p.paymentTermsDays} days` : '—'
    },
    { key: 'isActive', header: 'Status', render: (p: Partner) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {p.isActive ? 'Active' : 'Inactive'}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Channel Partners"
        subtitle="Manage retail and distribution partners"
        action={
          <button
            onClick={() => navigate('/partners/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Add Partner
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by name or contact..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(p) => navigate(`/partners/${p.id}`)}
            emptyMessage="No partners found"
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
