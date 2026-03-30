import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Partner { id: string; name: string; discountPct: string; branches: Array<{ id: string; name: string }> }
interface Title { id: string; title: string; isbn13?: string; rrpZar: string }

interface OrderLine {
  key: string;
  titleId: string;
  titleName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export function CreateOrderOnBehalf() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [searchTitle, setSearchTitle] = useState('');

  const { data: partnersData } = useQuery({
    queryKey: ['partners-all'],
    queryFn: () => api<{ data: Partner[] }>('/partners?limit=500'),
  });

  const { data: titlesData } = useQuery({
    queryKey: ['titles-search', searchTitle],
    queryFn: () => api<{ data: Title[] }>(`/titles?limit=50&search=${searchTitle}`),
    enabled: searchTitle.length > 1,
  });

  const partners = partnersData?.data ?? [];
  const selectedPartner = partners.find((p) => p.id === partnerId);
  const branches = selectedPartner?.branches ?? [];
  const discount = Number(selectedPartner?.discountPct || 0);

  const addLine = (title: Title) => {
    if (lines.some((l) => l.titleId === title.id)) return;
    const rrp = Number(title.rrpZar);
    setLines([...lines, {
      key: crypto.randomUUID(),
      titleId: title.id,
      titleName: title.title,
      quantity: 1,
      unitPrice: rrp,
      discountPct: discount,
    }]);
    setSearchTitle('');
  };

  const updateLine = (key: string, field: keyof OrderLine, value: any) => {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const subtotal = lines.reduce((sum, l) => {
    const lineTotal = l.quantity * l.unitPrice * (1 - l.discountPct / 100);
    return sum + lineTotal;
  }, 0);

  const mutation = useMutation({
    mutationFn: () => api('/order-tracking/orders/create-on-behalf', {
      method: 'POST',
      body: JSON.stringify({
        partnerId,
        branchId: branchId || null,
        customerPoNumber: customerPoNumber || null,
        deliveryAddress: deliveryAddress || null,
        notes: notes || null,
        lines: lines.map((l) => ({ titleId: l.titleId, quantity: l.quantity })),
      }),
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['partner-orders'] });
      navigate(`/partners/portal-orders`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <PageHeader
        title="Create Order on Behalf of Partner"
        subtitle="Enter an order received via email or phone from a channel partner"
        backTo={{ label: 'Partner Orders', href: '/partners/portal-orders' }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="max-w-4xl space-y-6">
        {/* Partner Selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Partner Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Channel Partner *</label>
              <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setBranchId(''); }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">— Select partner —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.discountPct}% discount)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" disabled={!branches.length}>
                <option value="">— HQ / No branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer PO Number</label>
              <input type="text" value={customerPoNumber} onChange={(e) => setCustomerPoNumber(e.target.value)}
                placeholder="Partner's reference number"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
              <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Order Lines</h3>

          {/* Title search */}
          <div className="relative">
            <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)}
              placeholder="Search titles to add..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            {titlesData?.data && titlesData.data.length > 0 && searchTitle.length > 1 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {titlesData.data.map((t) => (
                  <button key={t.id} onClick={() => addLine(t)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100">
                    {t.title} {t.isbn13 ? `(${t.isbn13})` : ''} — R {Number(t.rrpZar).toFixed(2)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Discount</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Line Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lines.map((l) => {
                  const lineTotal = l.quantity * l.unitPrice * (1 - l.discountPct / 100);
                  return (
                    <tr key={l.key}>
                      <td className="px-3 py-2 text-sm text-gray-900">{l.titleName}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={l.quantity}
                          onChange={(e) => updateLine(l.key, 'quantity', Number(e.target.value))}
                          className="w-20 text-right rounded-md border border-gray-300 px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2 text-sm text-right text-gray-500">R {l.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-right text-gray-500">{l.discountPct}%</td>
                      <td className="px-3 py-2 text-sm text-right font-medium">R {lineTotal.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeLine(l.key)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-sm text-right">Subtotal:</td>
                  <td className="px-3 py-2 text-sm text-right">R {subtotal.toFixed(2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
          {lines.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Search and add titles above to build the order.</p>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Received via email from John at Bargain Books on 29 March" />
        </div>

        <div className="flex gap-3">
          <button onClick={() => mutation.mutate()}
            disabled={!partnerId || lines.length === 0 || mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Order'}
          </button>
          <button onClick={() => navigate('/partners/portal-orders')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
