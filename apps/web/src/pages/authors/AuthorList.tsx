import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Author {
  id: string;
  legalName: string;
  penName: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export function AuthorList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['authors', page, search],
    queryFn: () =>
      api<PaginatedResponse<Author>>(
        `/authors?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'legalName', header: 'Legal Name' },
    { key: 'penName', header: 'Pen Name' },
    { key: 'type', header: 'Type', render: (a: Author) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        a.type === 'HYBRID' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {a.type}
      </span>
    )},
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Status', render: (a: Author) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {a.isActive ? 'Active' : 'Inactive'}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Authors"
        subtitle="Manage author profiles and contracts"
        action={
          <button
            onClick={() => navigate('/authors/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Add Author
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by name or email..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(a) => navigate(`/authors/${a.id}`)}
            emptyMessage="No authors found"
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
