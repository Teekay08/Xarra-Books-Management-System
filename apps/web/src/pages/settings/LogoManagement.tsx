import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

export function LogoManagement() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ data: { logoUrl: string | null } | null }>('/settings'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api('/settings/logo', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/v1/settings/logo', { method: 'POST', body: formData });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const logoUrl = data?.data?.logoUrl;

  return (
    <div>
      <PageHeader title="Logo Management" subtitle="Upload your company logo for business documents" />

      <div className="max-w-xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Current Logo</h3>
          {logoUrl ? (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-center">
                <img src={logoUrl} alt="Company Logo" className="max-h-32 max-w-full" />
              </div>
              <button
                onClick={() => { if (confirm('Remove logo?')) deleteMutation.mutate(); }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Remove Logo
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No logo uploaded yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Upload Logo</h3>
          <p className="text-xs text-gray-500 mb-3">
            Accepted formats: PNG, JPEG, SVG, WebP. Max 5MB. Recommended: transparent PNG, at least 400px wide.
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
          {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Where is the logo used?</h3>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>Invoices and credit notes (PDF header)</li>
            <li>Statements (PDF header)</li>
            <li>Quotations / pro-forma invoices (PDF header)</li>
            <li>Debit notes (PDF header)</li>
          </ul>
          <p className="text-xs text-gray-400 mt-3">
            The login screen and sidebar use the default Xarra Books logo from the application assets.
            Upload a logo here to brand your generated business documents (PDFs).
          </p>
        </div>

        {logoUrl && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Document Preview</h3>
            <div className="border border-gray-200 rounded p-6 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <img src={logoUrl} alt="Logo" className="max-h-12 max-w-[180px] mb-2" />
                  <p className="text-lg font-bold text-green-800">Xarra Books</p>
                  <p className="text-xs text-gray-400">Midrand, Gauteng, South Africa</p>
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
        )}
      </div>
    </div>
  );
}
