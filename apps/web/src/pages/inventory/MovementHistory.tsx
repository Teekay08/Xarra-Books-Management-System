import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';

interface Movement {
  id: string;
  titleId: string;
  movementType: string;
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
  referenceType: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  IN: 'bg-green-100 text-green-700',
  RETURN: 'bg-blue-100 text-blue-700',
  CONSIGN: 'bg-amber-100 text-amber-700',
  SELL: 'bg-purple-100 text-purple-700',
  ADJUST: 'bg-gray-100 text-gray-600',
  WRITEOFF: 'bg-red-100 text-red-700',
};

export function MovementHistory() {
  const { titleId } = useParams();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['movements', titleId, page],
    queryFn: () =>
      api<PaginatedResponse<Movement>>(
        `/inventory/titles/${titleId}/movements?page=${page}&limit=20`
      ),
  });

  const columns = [
    { key: 'createdAt', header: 'Date', render: (m: Movement) =>
      new Date(m.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    },
    { key: 'movementType', header: 'Type', render: (m: Movement) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[m.movementType] ?? ''}`}>
        {m.movementType}
      </span>
    )},
    { key: 'quantity', header: 'Qty', render: (m: Movement) => (
      <span className={`font-mono ${
        ['IN', 'RETURN'].includes(m.movementType) ? 'text-green-700' : 'text-red-600'
      }`}>
        {['IN', 'RETURN', 'ADJUST'].includes(m.movementType) && m.quantity > 0 ? '+' : ''}{m.quantity}
      </span>
    )},
    { key: 'fromLocation', header: 'From', render: (m: Movement) => m.fromLocation?.replace(/_/g, ' ') ?? '—' },
    { key: 'toLocation', header: 'To', render: (m: Movement) => m.toLocation?.replace(/_/g, ' ') ?? '—' },
    { key: 'reason', header: 'Reason' },
  ];

  return (
    <div>
      <PageHeader title="Movement History" subtitle={`Title: ${titleId}`} />

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            emptyMessage="No movements recorded for this title"
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
