import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface SyncOperation {
  id: string;
  platform: string;
  operationType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsSkipped: number | null;
  errorCount: number | null;
  errorDetails: { message: string; detail?: string }[] | null;
}

const platformColors: Record<string, string> = {
  WOOCOMMERCE: 'bg-purple-100 text-purple-700',
  TAKEALOT: 'bg-blue-100 text-blue-700',
  AMAZON_KDP: 'bg-orange-100 text-orange-700',
};

const statusColors: Record<string, string> = {
  RUNNING: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-100 text-red-700',
};

export function SyncDashboard() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPlatform, setCsvPlatform] = useState<'takealot' | 'kdp'>('takealot');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [exchangeRate, setExchangeRate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => api<{ data: SyncOperation[] }>('/sync?limit=50'),
  });

  const takealotPollMutation = useMutation({
    mutationFn: (body: { since: string; until?: string }) =>
      api('/sync/takealot/poll', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-history'] }),
  });

  const csvImportMutation = useMutation({
    mutationFn: (params: { file: File; platform: string; exchangeRate?: string }) => {
      const formData = new FormData();
      formData.append('file', params.file);
      if (params.exchangeRate) formData.append('exchangeRate', params.exchangeRate);
      return api(`/sync/${params.platform}`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      setShowCsvModal(false);
      setCsvFile(null);
      setExchangeRate('');
    },
  });

  const history = data?.data ?? [];

  // Last sync per platform
  const lastSyncByPlatform = new Map<string, SyncOperation>();
  for (const op of history) {
    if (!lastSyncByPlatform.has(op.platform) && op.status !== 'RUNNING') {
      lastSyncByPlatform.set(op.platform, op);
    }
  }

  function handleTakealotPoll() {
    const since = prompt('Sync Takealot sales since (YYYY-MM-DD):', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
    if (since) takealotPollMutation.mutate({ since });
  }

  return (
    <div>
      <PageHeader title="Sync Dashboard" subtitle="Manage data imports from external platforms" />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SyncCard
          platform="Takealot"
          lastSync={lastSyncByPlatform.get('TAKEALOT')}
          actions={
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleTakealotPoll}
                disabled={takealotPollMutation.isPending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {takealotPollMutation.isPending ? 'Syncing...' : 'API Sync'}
              </button>
              <button
                onClick={() => { setCsvPlatform('takealot'); setShowCsvModal(true); }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                CSV Import
              </button>
            </div>
          }
        />
        <SyncCard
          platform="WooCommerce"
          lastSync={lastSyncByPlatform.get('WOOCOMMERCE')}
          actions={
            <p className="mt-3 text-xs text-gray-400">Configure via API</p>
          }
        />
        <SyncCard
          platform="Amazon KDP"
          lastSync={lastSyncByPlatform.get('AMAZON_KDP')}
          actions={
            <button
              onClick={() => { setCsvPlatform('kdp'); setShowCsvModal(true); }}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              CSV Import
            </button>
          }
        />
      </div>

      {/* Sync history */}
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Sync History</h2>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Processed</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Skipped</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Errors</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
            {history.map((op) => (
              <>
                <tr
                  key={op.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}
                >
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${platformColors[op.platform] ?? 'bg-gray-100 text-gray-600'}`}>
                      {op.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[op.status] ?? ''}`}>
                      {op.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{op.recordsProcessed ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-green-700">{op.recordsCreated ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{op.recordsSkipped ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-red-600">{op.errorCount ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(op.startedAt).toLocaleString('en-ZA')}
                  </td>
                </tr>
                {expandedId === op.id && op.errorDetails && op.errorDetails.length > 0 && (
                  <tr key={`${op.id}-errors`}>
                    <td colSpan={7} className="px-6 py-3 bg-red-50">
                      <p className="text-xs font-medium text-red-700 mb-2">Error Details</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {op.errorDetails.map((err, i) => (
                          <div key={i} className="text-xs text-red-600">
                            <span className="font-medium">{err.message}</span>
                            {err.detail && <span className="text-red-400 ml-2">— {err.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!isLoading && history.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No sync operations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Import {csvPlatform === 'takealot' ? 'Takealot' : 'KDP'} CSV Report
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {csvFile && (
                  <p className="mt-1 text-xs text-gray-500">{csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)</p>
                )}
              </div>
              {csvPlatform === 'kdp' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USD → ZAR Exchange Rate (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="e.g. 18.50"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            {csvImportMutation.isError && (
              <p className="mt-3 text-sm text-red-600">{(csvImportMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => { setShowCsvModal(false); setCsvFile(null); setExchangeRate(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => csvFile && csvImportMutation.mutate({ file: csvFile, platform: csvPlatform, exchangeRate: exchangeRate || undefined })}
                disabled={!csvFile || csvImportMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {csvImportMutation.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncCard({ platform, lastSync, actions }: {
  platform: string;
  lastSync?: SyncOperation;
  actions: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{platform}</h3>
      {lastSync ? (
        <div className="mt-2 text-xs text-gray-500">
          <p>Last sync: {new Date(lastSync.completedAt || lastSync.startedAt).toLocaleString('en-ZA')}</p>
          <p className="mt-0.5">
            {lastSync.recordsCreated ?? 0} new records
            {lastSync.errorCount ? `, ${lastSync.errorCount} errors` : ''}
          </p>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[lastSync.status] ?? ''}`}>
            {lastSync.status}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">No sync history</p>
      )}
      {actions}
    </div>
  );
}
