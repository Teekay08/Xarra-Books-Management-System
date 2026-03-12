import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResponse } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { INVENTORY_LOCATIONS } from '@xarra/shared';

interface StockRow {
  titleId: string;
  title: string;
  isbn13: string | null;
  totalIn: number;
  totalOut: number;
  stockOnHand: number;
}

interface CountLine {
  titleId: string;
  title: string;
  isbn13: string | null;
  expectedQty: number;
  countedQty: number | '';
}

interface VarianceLine {
  titleId: string;
  title: string;
  isbn13: string | null;
  expectedQty: number;
  countedQty: number;
  variance: number;
}

type Phase = 'setup' | 'counting' | 'review';

const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export function StockTake() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('setup');
  const [location, setLocation] = useState('XARRA_WAREHOUSE');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [varianceLines, setVarianceLines] = useState<VarianceLine[]>([]);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [filterText, setFilterText] = useState('');

  // Fetch stock for selected location
  const stockQuery = useQuery({
    queryKey: ['inventory-stock-all', location],
    queryFn: () =>
      api<PaginatedResponse<StockRow>>(`/inventory/stock?limit=1000&location=${encodeURIComponent(location)}`),
    enabled: false,
  });

  // Submit count to get variance report
  const submitCountMut = useMutation({
    mutationFn: (body: { location: string; lines: { titleId: string; countedQty: number }[] }) =>
      api<{ data: VarianceLine[] }>('/inventory/stock-take', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      setVarianceLines(res.data ?? []);
      setPhase('review');
      setIsDirty(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Apply adjustments
  const applyMut = useMutation({
    mutationFn: (body: { location: string; lines: { titleId: string; countedQty: number }[] }) =>
      api('/inventory/stock-take/apply', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      navigate('/inventory');
    },
    onError: (err: Error) => setError(err.message),
  });

  async function handleStartCount() {
    setError('');
    try {
      const result = await stockQuery.refetch();
      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : 'Failed to load stock data');
        return;
      }
      const rows = result.data?.data ?? [];
      if (rows.length === 0) {
        setError('No stock found at this location. Please check that inventory has been received here.');
        return;
      }
      setLines(
        rows.map((r) => ({
          titleId: r.titleId,
          title: r.title,
          isbn13: r.isbn13,
          expectedQty: r.stockOnHand,
          countedQty: '',
        }))
      );
      setPhase('counting');
    } catch (err: any) {
      setError(err.message ?? 'Failed to load stock data');
    }
  }

  function updateCount(titleId: string, value: string) {
    if (!isDirty) setIsDirty(true);
    setLines((prev) =>
      prev.map((l) =>
        l.titleId === titleId
          ? { ...l, countedQty: value === '' ? '' : Number(value) }
          : l
      )
    );
  }

  function handleSubmitCount() {
    setError('');
    const incomplete = lines.filter((l) => l.countedQty === '');
    if (incomplete.length > 0) {
      setError(`${incomplete.length} title(s) have no counted quantity. Please enter a count for all items.`);
      return;
    }
    submitCountMut.mutate({
      location,
      lines: lines.map((l) => ({
        titleId: l.titleId,
        countedQty: l.countedQty as number,
      })),
    });
  }

  function handleApply() {
    setError('');
    applyMut.mutate({
      location,
      lines: varianceLines.map((l) => ({
        titleId: l.titleId,
        countedQty: l.countedQty,
      })),
    });
  }

  function handleReject() {
    setPhase('setup');
    setLines([]);
    setVarianceLines([]);
    setIsDirty(false);
    setError('');
  }

  const filteredLines = filterText
    ? lines.filter(
        (l) =>
          l.title.toLowerCase().includes(filterText.toLowerCase()) ||
          (l.isbn13 && l.isbn13.includes(filterText))
      )
    : lines;

  const totalVariance = varianceLines.reduce((sum, l) => sum + Math.abs(l.variance), 0);
  const positiveCount = varianceLines.filter((l) => l.variance > 0).length;
  const negativeCount = varianceLines.filter((l) => l.variance < 0).length;
  const matchCount = varianceLines.filter((l) => l.variance === 0).length;

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader
        title="Stock Take"
        subtitle="Perform a physical stock count and reconcile variances"
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Phase 1: Setup */}
      {phase === 'setup' && (
        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={cls}
            >
              {INVENTORY_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStartCount}
              disabled={stockQuery.isFetching}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {stockQuery.isFetching ? 'Loading...' : 'Start Count'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Phase 2: Counting */}
      {phase === 'counting' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Location: <span className="font-semibold">{location.replace(/_/g, ' ')}</span>
              {' \u00b7 '}
              {lines.length} title(s) to count
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Filter titles..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    ISBN
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Expected
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 w-32">
                    Counted
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Variance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredLines.map((line) => {
                  const variance =
                    line.countedQty === '' ? null : (line.countedQty as number) - line.expectedQty;
                  return (
                    <tr key={line.titleId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{line.title}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 font-mono">
                        {line.isbn13 ?? '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono text-gray-700">
                        {line.expectedQty}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          value={line.countedQty}
                          onChange={(e) => updateCount(line.titleId, e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-right font-mono focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono font-semibold">
                        {variance === null ? (
                          <span className="text-gray-300">-</span>
                        ) : variance > 0 ? (
                          <span className="text-green-600">+{variance}</span>
                        ) : variance < 0 ? (
                          <span className="text-red-600">{variance}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSubmitCount}
              disabled={submitCountMut.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {submitCountMut.isPending ? 'Submitting...' : 'Submit Count'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('setup');
                setLines([]);
                setIsDirty(false);
                setFilterText('');
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Phase 3: Variance Report / Review */}
      {phase === 'review' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Variance Report</h2>
          <p className="text-sm text-gray-600">
            Location: <span className="font-semibold">{location.replace(/_/g, ' ')}</span>
          </p>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{varianceLines.length}</p>
              <p className="text-xs text-gray-500">Titles Counted</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{positiveCount}</p>
              <p className="text-xs text-gray-500">Over (+)</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{negativeCount}</p>
              <p className="text-xs text-gray-500">Short (-)</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-500">{matchCount}</p>
              <p className="text-xs text-gray-500">Match</p>
            </div>
          </div>

          {totalVariance > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              Total absolute variance: <span className="font-semibold">{totalVariance}</span> units across{' '}
              {positiveCount + negativeCount} title(s).
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    ISBN
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Expected
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Counted
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Variance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {varianceLines.map((line) => (
                  <tr key={line.titleId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{line.title}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 font-mono">
                      {line.isbn13 ?? '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-700">
                      {line.expectedQty}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-700">
                      {line.countedQty}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono font-semibold">
                      {line.variance > 0 ? (
                        <span className="text-green-600">+{line.variance}</span>
                      ) : line.variance < 0 ? (
                        <span className="text-red-600">{line.variance}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={applyMut.isPending || totalVariance === 0}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {applyMut.isPending ? 'Applying...' : 'Approve Adjustments'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
