import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { QuickPartnerCreate } from '../../components/QuickPartnerCreate';

// ─── Types ───────────────────────────────────────────────────────────

interface Partner {
  id: string;
  name: string;
  branches?: { id: string; name: string }[];
}

interface BatchItem {
  id: string;
  partnerId: string;
  branchId: string | null;
  recipientEmail: string | null;
  sendToType: 'DIRECT' | 'BRANCH' | 'HQ_CONSOLIDATED';
  status: 'PENDING' | 'EXCLUDED' | 'SENT' | 'FAILED';
  closingBalance: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  partner?: { id: string; name: string };
  branch?: { id: string; name: string } | null;
}

interface Batch {
  id: string;
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  status: 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'SENDING' | 'SENT';
  reviewedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  totalItems: number;
  totalSent: number;
  totalFailed: number;
  notes: string | null;
  createdAt: string;
  items?: BatchItem[];
}

type BranchMode = 'single' | 'multiple' | 'consolidated';

// ─── Constants ───────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REVIEWED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  SENDING: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-emerald-100 text-emerald-700',
};

const itemStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  EXCLUDED: 'bg-orange-100 text-orange-700',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const sendTypeLabels: Record<string, string> = {
  DIRECT: 'Direct',
  BRANCH: 'Branch',
  HQ_CONSOLIDATED: 'HQ Consolidated',
};

const tabClass = (active: boolean) =>
  `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
    active
      ? 'border-green-600 text-green-700'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  }`;

// ─── Batch Management Tab ────────────────────────────────────────────

function BatchManagement() {
  const queryClient = useQueryClient();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<{ itemId: string; email: string } | null>(null);
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);
  const [compileMonth, setCompileMonth] = useState('');
  const [compileYear, setCompileYear] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: batchesData, isLoading } = useQuery({
    queryKey: ['statement-batches'],
    queryFn: () => api<{ data: Batch[] }>('/statements/batches'),
  });

  const { data: batchDetail } = useQuery({
    queryKey: ['statement-batch', selectedBatchId],
    queryFn: () => api<{ data: Batch }>(`/statements/batches/${selectedBatchId}`),
    enabled: !!selectedBatchId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['statement-batches'] });
    queryClient.invalidateQueries({ queryKey: ['statement-batch', selectedBatchId] });
  };

  const reviewMutation = useMutation({
    mutationFn: (id: string) => api(`/statements/batches/${id}/review`, { method: 'POST' }),
    onSuccess: () => { invalidate(); setSuccess('Batch marked as reviewed'); setTimeout(() => setSuccess(''), 3000); },
    onError: (err) => setError(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api(`/statements/batches/${id}/approve`, { method: 'POST' }),
    onSuccess: () => { invalidate(); setSuccess('Batch approved for sending'); setTimeout(() => setSuccess(''), 3000); },
    onError: (err) => setError(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api(`/statements/batches/${id}/send`, { method: 'POST' }),
    onSuccess: () => { invalidate(); setSuccess('Statements sent successfully'); setTimeout(() => setSuccess(''), 3000); },
    onError: (err) => setError(err.message),
  });

  const excludeMutation = useMutation({
    mutationFn: ({ batchId, itemId }: { batchId: string; itemId: string }) =>
      api(`/statements/batches/${batchId}/items/${itemId}/exclude`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });

  const includeMutation = useMutation({
    mutationFn: ({ batchId, itemId }: { batchId: string; itemId: string }) =>
      api(`/statements/batches/${batchId}/items/${itemId}/include`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });

  const updateEmailMutation = useMutation({
    mutationFn: ({ batchId, itemId, email }: { batchId: string; itemId: string; email: string }) =>
      api(`/statements/batches/${batchId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ recipientEmail: email }),
      }),
    onSuccess: () => { invalidate(); setEditingEmail(null); },
  });

  const compileMutation = useMutation({
    mutationFn: (body: { month: number; year: number }) =>
      api<{ data: { id: string } }>('/statements/batches/compile', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (result) => {
      invalidate();
      setSuccess('Batch compiled successfully');
      setCompileMonth('');
      setCompileYear('');
      if (result?.data?.id) setSelectedBatchId(result.data.id);
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => setError(err.message),
  });

  async function downloadBatchItem(item: BatchItem, b: Batch) {
    setDownloadingItemId(item.id);
    try {
      const res = await fetch('/api/v1/statements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: item.partnerId,
          branchId: item.branchId ?? undefined,
          periodFrom: b.periodFrom.slice(0, 10),
          periodTo: b.periodTo.slice(0, 10),
          consolidated: item.sendToType === 'HQ_CONSOLIDATED',
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        setError('Failed to generate PDF');
      }
    } finally {
      setDownloadingItemId(null);
    }
  }

  const batches = batchesData?.data ?? [];
  const batch = batchDetail?.data;
  const items = batch?.items ?? [];

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 mb-4">{success}</div>}

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Batch List */}
        <div className="col-span-4 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Compile Statements</h3>
            <div className="flex gap-2 mb-2">
              <select
                value={compileMonth}
                onChange={e => setCompileMonth(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Month</option>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={compileYear}
                onChange={e => setCompileYear(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Year</option>
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (!compileMonth || !compileYear) { setError('Select month and year'); return; }
                setError('');
                compileMutation.mutate({ month: Number(compileMonth), year: Number(compileYear) });
              }}
              disabled={compileMutation.isPending}
              className="w-full rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {compileMutation.isPending ? 'Compiling...' : 'Compile'}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {batches.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                No statement batches yet. Compile one above or wait for auto-compilation.
              </div>
            ) : batches.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBatchId(b.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selectedBatchId === b.id ? 'bg-green-50 border-l-3 border-green-600' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{b.periodLabel}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[b.status]}`}>
                    {b.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {b.totalItems} items
                  {b.totalSent > 0 && ` · ${b.totalSent} sent`}
                  {b.totalFailed > 0 && ` · ${b.totalFailed} failed`}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Batch Detail */}
        <div className="col-span-8">
          {!selectedBatchId ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400 text-sm">
              Select a batch from the list to view details, or compile a new one.
            </div>
          ) : !batch ? (
            <div className="py-12 text-center text-gray-400">Loading batch...</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{batch.periodLabel}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(batch.periodFrom).toLocaleDateString('en-ZA')} — {new Date(batch.periodTo).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusColors[batch.status]}`}>
                    {batch.status}
                  </span>
                </div>

                <div className="flex gap-3 text-xs text-gray-500 mb-4">
                  <span>{batch.totalItems} total</span>
                  <span>·</span>
                  <span>{items.filter(i => i.status === 'PENDING').length} pending</span>
                  <span>·</span>
                  <span>{items.filter(i => i.status === 'EXCLUDED').length} excluded</span>
                  {batch.totalSent > 0 && <><span>·</span><span className="text-green-600">{batch.totalSent} sent</span></>}
                  {batch.totalFailed > 0 && <><span>·</span><span className="text-red-600">{batch.totalFailed} failed</span></>}
                </div>

                <div className="flex gap-2">
                  {batch.status === 'DRAFT' && (
                    <button
                      onClick={() => reviewMutation.mutate(batch.id)}
                      disabled={reviewMutation.isPending}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {reviewMutation.isPending ? 'Reviewing...' : 'Mark as Reviewed'}
                    </button>
                  )}
                  {batch.status === 'REVIEWED' && (
                    <button
                      onClick={() => approveMutation.mutate(batch.id)}
                      disabled={approveMutation.isPending}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {approveMutation.isPending ? 'Approving...' : 'Approve for Sending'}
                    </button>
                  )}
                  {batch.status === 'APPROVED' && (
                    <button
                      onClick={() => {
                        if (confirm(`Send ${items.filter(i => i.status === 'PENDING').length} statement(s) to partners?`)) {
                          sendMutation.mutate(batch.id);
                        }
                      }}
                      disabled={sendMutation.isPending}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {sendMutation.isPending ? 'Sending...' : 'Send Statements'}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(item => (
                      <tr key={item.id} className={item.status === 'EXCLUDED' ? 'opacity-50' : ''}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div>{item.partner?.name ?? '—'}</div>
                          {item.branch && <div className="text-xs text-gray-500">{item.branch.name}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{sendTypeLabels[item.sendToType]}</td>
                        <td className="px-4 py-3 text-sm">
                          {editingEmail?.itemId === item.id ? (
                            <div className="flex gap-1">
                              <input
                                type="email"
                                value={editingEmail.email}
                                onChange={e => setEditingEmail({ ...editingEmail, email: e.target.value })}
                                className="rounded border border-gray-300 px-2 py-1 text-xs w-48"
                                autoFocus
                              />
                              <button
                                onClick={() => updateEmailMutation.mutate({
                                  batchId: batch.id, itemId: item.id, email: editingEmail.email,
                                })}
                                className="text-xs text-green-600 font-medium"
                              >Save</button>
                              <button onClick={() => setEditingEmail(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingEmail({ itemId: item.id, email: item.recipientEmail ?? '' })}
                              className="text-xs text-gray-600 hover:text-blue-600"
                              title="Click to edit email"
                            >
                              {item.recipientEmail || <span className="text-red-500 italic">No email</span>}
                            </button>
                          )}
                          {item.errorMessage && <div className="text-xs text-red-500 mt-1">{item.errorMessage}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-gray-900">
                          {item.closingBalance ? `R ${Number(item.closingBalance).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${itemStatusColors[item.status]}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => downloadBatchItem(item, batch)}
                              disabled={downloadingItemId === item.id}
                              className="text-xs text-green-700 hover:text-green-800 font-medium disabled:opacity-50"
                              title="Download PDF"
                            >
                              {downloadingItemId === item.id ? '...' : 'Download'}
                            </button>
                            {['DRAFT', 'REVIEWED'].includes(batch.status) && (
                              <>
                                {item.status === 'PENDING' && (
                                  <button
                                    onClick={() => excludeMutation.mutate({ batchId: batch.id, itemId: item.id })}
                                    className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                                  >Exclude</button>
                                )}
                                {item.status === 'EXCLUDED' && (
                                  <button
                                    onClick={() => includeMutation.mutate({ batchId: batch.id, itemId: item.id })}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                  >Include</button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No items in this batch</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Individual Statement Tab ────────────────────────────────────────

function IndividualStatement() {
  const [partnerId, setPartnerId] = useState('');
  const [branchMode, setBranchMode] = useState<BranchMode>('single');
  const [branchId, setBranchId] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [showPartnerCreate, setShowPartnerCreate] = useState(false);

  const { data: partners } = useQuery({
    queryKey: ['partners-select'],
    queryFn: () => api<{ data: Partner[] }>('/partners?limit=500'),
  });

  const { data: partnerDetail } = useQuery({
    queryKey: ['partner', partnerId],
    queryFn: () => api<{ data: Partner }>(`/partners/${partnerId}`),
    enabled: !!partnerId,
  });

  const branches = partnerDetail?.data?.branches ?? [];
  const partnerOptions = (partners?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  function handlePartnerChange(id: string) {
    setPartnerId(id);
    setBranchId('');
    setSelectedBranchIds([]);
    setBranchMode('single');
  }

  function toggleBranch(id: string) {
    setSelectedBranchIds((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);
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

  async function handlePreview(form: HTMLFormElement) {
    const fd = new FormData(form);
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
      <form onSubmit={handleGenerate} className="max-w-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel Partner *</label>
          <SearchableSelect
            options={partnerOptions}
            value={partnerId}
            onChange={handlePartnerChange}
            placeholder="Search partners..."
            required
            onCreateNew={() => setShowPartnerCreate(true)}
            createNewLabel="Create new partner"
          />
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
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}

            {branchMode === 'multiple' && (
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedBranchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} className="rounded border-gray-300" />
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
            onClick={() => { const form = document.querySelector('form'); if (form) handlePreview(form); }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >Preview Data</button>
          <button
            type="submit"
            disabled={generating || !partnerId}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >{generating ? 'Generating...' : 'Download PDF'}</button>
        </div>

        {partnerId && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Send Statement via Email</h3>
            <p className="text-xs text-gray-500 mb-4">
              Send the statement as a PDF attachment to the partner's head office.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email (leave blank to use partner's contact email)</label>
                <input type="email" value={emailOverride} onChange={(e) => setEmailOverride(e.target.value)} placeholder="Uses partner contact email" className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (optional)</label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={2} placeholder="Add a custom message..." className={cls} />
              </div>
            </div>
            {sendResult && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{sendResult}</div>}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={sending || !partnerId}
                onClick={async () => {
                  setSending(true);
                  setSendResult(null);
                  const form = document.querySelector('form');
                  if (!form) return;
                  const fd = new FormData(form);
                  try {
                    const res = await api<{ data: { message: string } }>('/statements/send', {
                      method: 'POST',
                      body: JSON.stringify({ ...buildBody(fd), recipientEmail: emailOverride || undefined, message: emailMessage || undefined, includeAllBranches: branchMode === 'consolidated' }),
                    });
                    setSendResult(res.data.message);
                  } catch (err: any) { setSendResult(`Failed: ${err.message}`); } finally { setSending(false); }
                }}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >{sending ? 'Sending...' : 'Email Statement PDF'}</button>
              {branches.length > 0 && (
                <button
                  type="button"
                  disabled={sendingAll || !partnerId}
                  onClick={async () => {
                    setSendingAll(true);
                    setSendResult(null);
                    const form = document.querySelector('form');
                    if (!form) return;
                    const fd = new FormData(form);
                    try {
                      const res = await api<{ data: { message: string } }>('/statements/send-all-branches', {
                        method: 'POST',
                        body: JSON.stringify({ partnerId, periodFrom: fd.get('periodFrom'), periodTo: fd.get('periodTo'), recipientEmail: emailOverride || undefined, message: emailMessage || undefined }),
                      });
                      setSendResult(res.data.message);
                    } catch (err: any) { setSendResult(`Failed: ${err.message}`); } finally { setSendingAll(false); }
                  }}
                  className="rounded-md bg-[#8B1A1A] px-5 py-2 text-sm font-medium text-white hover:bg-[#6B1414] disabled:opacity-50"
                >{sendingAll ? 'Sending...' : 'Email All Branch Statements to HQ'}</button>
              )}
            </div>
          </div>
        )}
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
              <div className="mt-4 border rounded-md overflow-x-auto">
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

      {showPartnerCreate && (
        <QuickPartnerCreate
          onClose={() => setShowPartnerCreate(false)}
          onCreated={(p) => handlePartnerChange(p.id)}
        />
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function StatementGenerate() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'batches' | 'individual'>('batches');

  return (
    <div>
      <PageHeader
        title="Statements"
        subtitle="Manage monthly partner statements and generate individual statements"
        action={
          <button
            onClick={() => navigate('/settings/scheduling')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Scheduling Settings
          </button>
        }
      />

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px">
          <button onClick={() => setActiveTab('batches')} className={tabClass(activeTab === 'batches')}>
            Monthly Batches
          </button>
          <button onClick={() => setActiveTab('individual')} className={tabClass(activeTab === 'individual')}>
            Individual Statement
          </button>
        </nav>
      </div>

      {activeTab === 'batches' ? <BatchManagement /> : <IndividualStatement />}
    </div>
  );
}
