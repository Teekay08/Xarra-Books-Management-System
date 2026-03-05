import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Partner {
  id: string;
  name: string;
  branches?: { id: string; name: string }[];
}

type BranchMode = 'single' | 'multiple' | 'consolidated';

export function StatementGenerate() {
  const [partnerId, setPartnerId] = useState('');
  const [branchMode, setBranchMode] = useState<BranchMode>('single');
  const [branchId, setBranchId] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const { data: partners } = useQuery({
    queryKey: ['partners'],
    queryFn: () => api<{ data: Partner[] }>('/partners?limit=100'),
  });

  const { data: partnerDetail } = useQuery({
    queryKey: ['partner', partnerId],
    queryFn: () => api<{ data: Partner }>(`/partners/${partnerId}`),
    enabled: !!partnerId,
  });

  const branches = partnerDetail?.data?.branches ?? [];

  function toggleBranch(id: string) {
    setSelectedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  }

  function buildBody(fd: FormData) {
    return {
      partnerId,
      branchId: branchMode === 'single' && branchId ? branchId : undefined,
      branchIds: branchMode === 'multiple' && selectedBranchIds.length > 0 ? selectedBranchIds : undefined,
      periodFrom: fd.get('periodFrom'),
      periodTo: fd.get('periodTo'),
      consolidated: branchMode === 'consolidated',
    };
  }

  async function handlePreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await api<{ data: any }>('/statements/preview', {
      method: 'POST',
      body: JSON.stringify(buildBody(fd)),
    });
    setPreview(result.data);
  }

  async function handleGenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGenerating(true);
    const fd = new FormData(e.currentTarget);
    const body = buildBody(fd);
    const endpoint = body.consolidated ? '/statements/generate-consolidated' : '/statements/generate';

    try {
      const res = await fetch(`/api/v1${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        alert('Failed to generate statement');
      }
    } finally {
      setGenerating(false);
    }
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="Generate Statement" subtitle="Create account statements for channel partners" />

      <form onSubmit={handleGenerate} className="max-w-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel Partner *</label>
          <select
            value={partnerId}
            onChange={(e) => { setPartnerId(e.target.value); setBranchId(''); setSelectedBranchIds([]); setBranchMode('single'); }}
            required
            className={cls}
          >
            <option value="">Select a partner...</option>
            {partners?.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {branches.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Branch Selection</label>
            <div className="flex gap-4 mb-3">
              {(['single', 'multiple', 'consolidated'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="branchMode"
                    checked={branchMode === mode}
                    onChange={() => { setBranchMode(mode); setBranchId(''); setSelectedBranchIds([]); }}
                    className="text-green-700"
                  />
                  {mode === 'single' ? 'Single Branch' : mode === 'multiple' ? 'Multiple Branches' : 'Consolidated (All)'}
                </label>
              ))}
            </div>

            {branchMode === 'single' && (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={cls}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {branchMode === 'multiple' && (
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedBranchIds.includes(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      className="rounded border-gray-300"
                    />
                    {b.name}
                  </label>
                ))}
                {selectedBranchIds.length > 0 && (
                  <div className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50">
                    {selectedBranchIds.length} branch{selectedBranchIds.length > 1 ? 'es' : ''} selected
                  </div>
                )}
              </div>
            )}

            {branchMode === 'consolidated' && (
              <p className="text-xs text-gray-500">Statement will include all branches combined.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period From *</label>
            <input name="periodFrom" type="date" defaultValue={monthAgo} required className={cls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period To *</label>
            <input name="periodTo" type="date" defaultValue={today} required className={cls} />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => handlePreview(e.currentTarget.form as any)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Preview Data
          </button>
          <button
            type="submit"
            disabled={generating || !partnerId}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate PDF'}
          </button>
        </div>
      </form>

      {preview && (
        <div className="mt-8 max-w-2xl">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Preview</h3>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Opening</p>
                <p className="text-lg font-bold">R {preview.openingBalance.toFixed(2)}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Invoiced</p>
                <p className="text-lg font-bold">R {preview.totalInvoiced.toFixed(2)}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Received</p>
                <p className="text-lg font-bold text-green-600">R {preview.totalReceived.toFixed(2)}</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded">
                <p className="text-xs text-gray-500">Balance Due</p>
                <p className="text-lg font-bold text-red-600">R {preview.closingBalance.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">{preview.transactions.length} transactions in period</p>

            {preview.transactions.length > 0 && (
              <div className="mt-4 border rounded-md overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">Date</th>
                      <th className="px-3 py-2 text-left text-gray-500">Type</th>
                      <th className="px-3 py-2 text-left text-gray-500">Reference</th>
                      <th className="px-3 py-2 text-right text-gray-500">Debit</th>
                      <th className="px-3 py-2 text-right text-gray-500">Credit</th>
                      <th className="px-3 py-2 text-right text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.transactions.map((t: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{new Date(t.date).toLocaleDateString()}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            t.type === 'INVOICE' ? 'bg-blue-100 text-blue-700' :
                            t.type === 'PAYMENT' ? 'bg-green-100 text-green-700' :
                            t.type === 'DEBIT_NOTE' ? 'bg-orange-100 text-orange-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{t.type.replace('_', ' ')}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono">{t.reference}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.debit > 0 ? `R ${t.debit.toFixed(2)}` : ''}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.credit > 0 ? `R ${t.credit.toFixed(2)}` : ''}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-medium">R {t.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
