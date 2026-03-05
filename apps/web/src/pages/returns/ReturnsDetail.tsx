import { useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface ReturnLine {
  id: string;
  quantity: number;
  condition: string;
  notes: string | null;
  title: { title: string; isbn13: string | null };
}

interface ReturnAuth {
  id: string;
  number: string;
  returnDate: string;
  reason: string;
  status: string;
  notes: string | null;
  processedAt: string | null;
  partner: { name: string };
  consignment: { id: string; dispatchDate: string } | null;
  lines: ReturnLine[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  AUTHORIZED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-yellow-100 text-yellow-700',
  PROCESSED: 'bg-green-100 text-green-700',
};

const conditionColors: Record<string, string> = {
  GOOD: 'text-green-700',
  DAMAGED: 'text-orange-600',
  UNSALEABLE: 'text-red-600',
};

export function ReturnsDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['return', id],
    queryFn: () => api<{ data: ReturnAuth }>(`/returns/${id}`),
  });

  const processMutation = useMutation({
    mutationFn: () =>
      api(`/returns/${id}/process`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return', id] });
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Return not found</div>;

  const ra = data.data;
  const canProcess = ra.status !== 'PROCESSED';
  const totalQty = ra.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div>
      <PageHeader
        title={ra.number}
        subtitle={ra.partner.name}
        action={
          canProcess ? (
            <button
              onClick={() => {
                if (confirm('Process this return? This will create inventory movements for the returned stock.'))
                  processMutation.mutate();
              }}
              disabled={processMutation.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {processMutation.isPending ? 'Processing...' : 'Process Return'}
            </button>
          ) : undefined
        }
      />

      <div className="max-w-3xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[ra.status] ?? ''}`}>
                {ra.status}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Return Date</span>
              <span>{new Date(ra.returnDate).toLocaleDateString('en-ZA')}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Total Items</span>
              <span className="font-mono">{totalQty}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Partner</span>
              <span>{ra.partner.name}</span>
            </div>
          </div>

          {ra.consignment && (
            <div className="mb-4 text-sm">
              <span className="text-xs text-gray-500 block">Linked Consignment</span>
              <span>Dispatched {new Date(ra.consignment.dispatchDate).toLocaleDateString('en-ZA')}</span>
            </div>
          )}

          <div className="mb-4">
            <span className="text-xs text-gray-500 block mb-1">Reason</span>
            <p className="text-sm text-gray-900">{ra.reason}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2">Title</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2">Condition</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ra.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">
                    <span className="font-medium">{line.title.title}</span>
                    {line.title.isbn13 && (
                      <span className="block text-xs text-gray-400 font-mono">{line.title.isbn13}</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">{line.quantity}</td>
                  <td className={`py-2 text-xs font-medium ${conditionColors[line.condition] ?? ''}`}>
                    {line.condition}
                  </td>
                  <td className="py-2 text-gray-500">{line.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ra.processedAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-700">
              Processed on {new Date(ra.processedAt).toLocaleDateString('en-ZA')} — inventory movements created.
            </p>
          </div>
        )}

        {ra.notes && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{ra.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
