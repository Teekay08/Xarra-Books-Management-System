import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Title {
  id: string;
  title: string;
  subtitle: string | null;
  isbn13: string | null;
  rrpZar: string;
  formats: string[];
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PRODUCTION: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  OUT_OF_PRINT: 'bg-gray-100 text-gray-500',
};

export function TitleList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['titles', page, search],
    queryFn: () =>
      api<PaginatedResponse<Title>>(
        `/titles?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      ),
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = [
    { key: 'title', header: 'Title', render: (t: Title) => (
      <div>
        <p className="font-medium text-gray-900">{t.title}</p>
        {t.subtitle && <p className="text-xs text-gray-500">{t.subtitle}</p>}
      </div>
    )},
    { key: 'isbn13', header: 'ISBN-13' },
    { key: 'rrpZar', header: 'RRP (ZAR)', render: (t: Title) => `R ${Number(t.rrpZar).toFixed(2)}` },
    { key: 'formats', header: 'Formats', render: (t: Title) => t.formats.join(', ') },
    { key: 'status', header: 'Status', render: (t: Title) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status] ?? ''}`}>
        {t.status}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Titles"
        subtitle="Manage book titles and editions"
        action={
          <button
            onClick={() => navigate('/titles/new')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            + Add Title
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={handleSearch} placeholder="Search by title or ISBN..." />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            onRowClick={(t) => navigate(`/titles/${t.id}`)}
            emptyMessage="No titles found"
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
