import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface Settings {
  id: string;
  companyName: string;
  tradingAs: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bankDetails: { bankName: string; accountNumber: string; branchCode: string; accountType: string } | null;
  logoUrl: string | null;
  invoiceFooterText: string | null;
  statementFooterText: string | null;
  minimumOrderQty: number | null;
}

const TABS = [
  { id: 'company', label: 'Company Details' },
  { id: 'branding', label: 'Branding & Logo' },
  { id: 'banking', label: 'Banking Details' },
  { id: 'documents', label: 'Document Settings' },
  { id: 'operational', label: 'Operational' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CompanySettings() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ data: Settings | null }>('/settings'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const deleteLogo = useMutation({
    mutationFn: () => api('/settings/logo', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccess('Logo removed');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      companyName: fd.get('companyName'),
      tradingAs: fd.get('tradingAs') || undefined,
      registrationNumber: fd.get('registrationNumber') || undefined,
      vatNumber: fd.get('vatNumber') || undefined,
      addressLine1: fd.get('addressLine1') || undefined,
      addressLine2: fd.get('addressLine2') || undefined,
      city: fd.get('city') || undefined,
      province: fd.get('province') || undefined,
      postalCode: fd.get('postalCode') || undefined,
      country: fd.get('country') || undefined,
      phone: fd.get('phone') || undefined,
      email: fd.get('email') || undefined,
      website: fd.get('website') || undefined,
      invoiceFooterText: fd.get('invoiceFooterText') || undefined,
      statementFooterText: fd.get('statementFooterText') || undefined,
      minimumOrderQty: fd.get('minimumOrderQty') ? Number(fd.get('minimumOrderQty')) : undefined,
    };

    const bankName = fd.get('bankName') as string;
    if (bankName) {
      body.bankDetails = {
        bankName,
        accountNumber: fd.get('accountNumber'),
        branchCode: fd.get('branchCode'),
        accountType: fd.get('accountType'),
      };
    }

    mutation.mutate(body, { onError: (err) => setError(err.message) });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api('/settings/logo', { method: 'POST', body: formData });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccess('Logo uploaded successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Logo upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  const s = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Manage your company profile, branding, and document configuration" />

      {error && <div className="mb-4 max-w-3xl rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 max-w-3xl rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-green-700 text-green-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Company Details Tab */}
      {activeTab === 'company' && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Company Information</legend>
            <p className="mb-4 text-xs text-gray-500">This information appears on all generated business documents (invoices, credit notes, statements, etc.).</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                  <input name="companyName" defaultValue={s?.companyName ?? 'Xarra Books'} required className={cls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trading As</label>
                  <input name="tradingAs" defaultValue={s?.tradingAs ?? ''} className={cls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                  <input name="registrationNumber" defaultValue={s?.registrationNumber ?? ''} className={cls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT Number</label>
                  <input name="vatNumber" defaultValue={s?.vatNumber ?? ''} className={cls} />
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Address</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                <input name="addressLine1" defaultValue={s?.addressLine1 ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                <input name="addressLine2" defaultValue={s?.addressLine2 ?? ''} className={cls} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input name="city" defaultValue={s?.city ?? ''} className={cls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                  <input name="province" defaultValue={s?.province ?? ''} className={cls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input name="postalCode" defaultValue={s?.postalCode ?? ''} className={cls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input name="country" defaultValue={s?.country ?? 'South Africa'} className={cls} />
              </div>
            </div>
          </fieldset>

          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Contact Details</legend>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input name="phone" defaultValue={s?.phone ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input name="email" type="email" defaultValue={s?.email ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input name="website" defaultValue={s?.website ?? ''} className={cls} placeholder="https://..." />
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Company Details'}
          </button>
        </form>
      )}

      {/* Branding & Logo Tab */}
      {activeTab === 'branding' && (
        <div className="max-w-3xl space-y-6">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Company Logo</h3>
            <p className="text-xs text-gray-500 mb-4">
              Your logo appears in the header of all generated documents: invoices, credit notes, statements, quotations, debit notes, purchase orders, and receipts.
            </p>

            {s?.logoUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <img src={s.logoUrl} alt="Company Logo" className="max-h-20 max-w-[240px]" />
                  </div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Replace Logo
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => { if (confirm('Remove the company logo?')) deleteLogo.mutate(); }}
                      disabled={deleteLogo.isPending}
                      className="flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove Logo
                    </button>
                  </div>
                </div>
                {uploading && <p className="text-sm text-gray-500">Uploading...</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8">
                  <div className="text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">No logo uploaded</p>
                    <p className="text-xs text-gray-400">Documents will use a text-only header</p>
                    <label className="mt-3 inline-block">
                      <span className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors">
                        Upload Logo
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {uploading && <p className="text-sm text-gray-500">Uploading...</p>}
                <p className="text-xs text-gray-500">
                  Accepted formats: PNG, JPEG, SVG, WebP. Max 5 MB. Recommended: transparent PNG, at least 400px wide.
                </p>
              </div>
            )}
          </div>

          {/* Document Preview */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Document Header Preview</h3>
            <div className="rounded border border-gray-200 bg-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  {s?.logoUrl && (
                    <img src={s.logoUrl} alt="Logo" className="max-h-12 max-w-[180px] mb-2" />
                  )}
                  <p className="text-lg font-bold text-green-800">{s?.companyName ?? 'Xarra Books'}</p>
                  {s?.tradingAs && <p className="text-xs text-gray-500">Trading as {s.tradingAs}</p>}
                  {(s?.addressLine1 || s?.city) ? (
                    <div className="text-xs text-gray-400 mt-1">
                      {s?.addressLine1 && <p>{s.addressLine1}</p>}
                      {s?.addressLine2 && <p>{s.addressLine2}</p>}
                      {(s?.city || s?.province) && <p>{[s?.city, s?.province].filter(Boolean).join(', ')}{s?.postalCode ? `, ${s.postalCode}` : ''}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 italic mt-1">No address configured — add one in Company Details</p>
                  )}
                  {s?.vatNumber && <p className="text-xs text-gray-400">VAT: {s.vatNumber}</p>}
                  {s?.phone && <p className="text-xs text-gray-400">Tel: {s.phone}</p>}
                  {s?.email && <p className="text-xs text-gray-400">Email: {s.email}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-800">TAX INVOICE</p>
                  <p className="text-xs text-gray-500 mt-1">INV-2026-0001</p>
                  <p className="text-xs text-gray-500">Date: 05 March 2026</p>
                </div>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="grid grid-cols-6 text-[10px] text-gray-400 uppercase font-medium">
                  <span>#</span>
                  <span className="col-span-2">Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="grid grid-cols-6 text-xs text-gray-300 mt-1">
                  <span>1</span>
                  <span className="col-span-2">Sample book title...</span>
                  <span className="text-right">10</span>
                  <span className="text-right">R 250.00</span>
                  <span className="text-right">R 2,500.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banking Details Tab */}
      {activeTab === 'banking' && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <input type="hidden" name="companyName" value={s?.companyName ?? 'Xarra Books'} />

          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Banking Details</legend>
            <p className="mb-4 text-xs text-gray-500">These details appear at the bottom of invoices so partners know where to make payment.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                <input name="bankName" defaultValue={s?.bankDetails?.bankName ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                <input name="accountNumber" defaultValue={s?.bankDetails?.accountNumber ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                <input name="branchCode" defaultValue={s?.bankDetails?.branchCode ?? ''} className={cls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                <input name="accountType" defaultValue={s?.bankDetails?.accountType ?? ''} className={cls} placeholder="e.g. Current, Savings" />
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Banking Details'}
          </button>
        </form>
      )}

      {/* Document Settings Tab */}
      {activeTab === 'documents' && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <input type="hidden" name="companyName" value={s?.companyName ?? 'Xarra Books'} />

          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Document Footer Text</legend>
            <p className="mb-4 text-xs text-gray-500">Custom text that appears at the bottom of generated PDF documents.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer</label>
                <textarea name="invoiceFooterText" defaultValue={s?.invoiceFooterText ?? ''} rows={3} className={cls} placeholder="e.g. Payment terms, disclaimers, thank you message..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statement Footer</label>
                <textarea name="statementFooterText" defaultValue={s?.statementFooterText ?? ''} rows={3} className={cls} placeholder="e.g. Account queries contact information..." />
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Document Settings'}
          </button>
        </form>
      )}

      {/* Operational Settings Tab */}
      {activeTab === 'operational' && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <input type="hidden" name="companyName" value={s?.companyName ?? 'Xarra Books'} />

          <fieldset className="card p-4">
            <legend className="px-2 text-sm font-semibold text-gray-700">Partner Portal Settings</legend>
            <p className="mb-4 text-xs text-gray-500">Configure rules and thresholds for the partner ordering portal.</p>
            <div className="space-y-4">
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Quantity</label>
                <input
                  name="minimumOrderQty"
                  type="number"
                  min={1}
                  defaultValue={s?.minimumOrderQty ?? 1}
                  className={cls}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The minimum total number of books a partner must order. Orders below this quantity will be rejected.
                </p>
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save Operational Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
