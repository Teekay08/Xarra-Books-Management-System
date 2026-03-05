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
}

export function CompanySettings() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  const s = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Manage company details for invoices and statements" />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Company Information</legend>
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

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Address</legend>
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

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Contact</legend>
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
              <input name="website" defaultValue={s?.website ?? ''} className={cls} />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Banking Details</legend>
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
              <input name="accountType" defaultValue={s?.bankDetails?.accountType ?? ''} className={cls} />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-2 text-sm font-medium text-gray-600">Document Footer Text</legend>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer</label>
              <textarea name="invoiceFooterText" defaultValue={s?.invoiceFooterText ?? ''} rows={2} className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statement Footer</label>
              <textarea name="statementFooterText" defaultValue={s?.statementFooterText ?? ''} rows={2} className={cls} />
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
