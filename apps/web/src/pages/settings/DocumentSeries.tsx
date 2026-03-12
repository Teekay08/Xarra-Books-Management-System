import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface DocumentSeries {
  invoiceStart?: number;
  creditNoteStart?: number;
  debitNoteStart?: number;
  quotationStart?: number;
  purchaseOrderStart?: number;
  cashSaleStart?: number;
  expenseClaimStart?: number;
  requisitionStart?: number;
}

const DOCUMENT_TYPES = [
  { key: 'invoiceStart', label: 'Invoices', prefix: 'INV', description: 'Tax invoices issued to partners' },
  { key: 'creditNoteStart', label: 'Credit Notes', prefix: 'CN', description: 'Credit notes for returns or adjustments' },
  { key: 'debitNoteStart', label: 'Debit Notes', prefix: 'DN', description: 'Debit notes for additional charges' },
  { key: 'quotationStart', label: 'Quotations', prefix: 'QUO', description: 'Quotations and estimates' },
  { key: 'purchaseOrderStart', label: 'Purchase Orders', prefix: 'PO', description: 'Purchase orders to suppliers' },
  { key: 'cashSaleStart', label: 'Cash Sales', prefix: 'CS', description: 'Direct cash sale receipts' },
  { key: 'expenseClaimStart', label: 'Expense Claims', prefix: 'EXP', description: 'Employee expense claims' },
  { key: 'requisitionStart', label: 'Requisitions', prefix: 'REQ', description: 'Internal requisition forms' },
] as const;

export function DocumentSeries() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['document-series'],
    queryFn: () => api<{ data: DocumentSeries | null }>('/settings/document-series'),
  });

  const mutation = useMutation({
    mutationFn: (body: DocumentSeries) =>
      api('/settings/document-series', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-series'] });
      setSuccess('Document series configuration saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const fd = new FormData(e.currentTarget);
    
    const body: DocumentSeries = {};
    for (const docType of DOCUMENT_TYPES) {
      const value = fd.get(docType.key) as string;
      if (value) {
        body[docType.key] = parseInt(value, 10);
      }
    }

    mutation.mutate(body);
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  
  const series = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader 
        title="Document Series Configuration" 
        subtitle="Configure starting numbers for document numbering sequences" 
      />

      {error && <div className="mb-4 max-w-3xl rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 max-w-3xl rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 max-w-3xl">
        <div className="flex">
          <svg className="h-5 w-5 text-amber-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-amber-700">
            <p className="font-medium mb-1">Important:</p>
            <p className="text-xs">
              These settings control the <span className="font-medium">starting number</span> for each document type's numbering sequence.
              Once documents have been created, changing these values will not affect existing documents but will determine the next document number.
              <span className="font-medium block mt-1">Only change these values if you need to reset or adjust the numbering sequence.</span>
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Document Starting Numbers</legend>
          <p className="mb-4 text-xs text-gray-500">
            Configure the starting number for each document type. Leave blank to use system defaults (typically 1).
          </p>
          
          <div className="space-y-4">
            {DOCUMENT_TYPES.map((docType) => (
              <div key={docType.key} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {docType.label}
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5">{docType.prefix}-####-####</p>
                </div>
                <div className="col-span-9">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name={docType.key}
                      min="1"
                      max="999999"
                      defaultValue={series?.[docType.key] ?? ''}
                      className={cls}
                      placeholder="1"
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {docType.description}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Examples */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Numbering Format Examples</h3>
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              <span className="font-medium">INV-2025-0001</span> - Starting from 1 in year 2025
            </p>
            <p>
              <span className="font-medium">INV-2025-1000</span> - Starting from 1000 (if you want to start at a specific number)
            </p>
            <p className="text-gray-500 mt-3">
              The system automatically increments document numbers and uses the current year in the format.
              The starting number you configure here determines where the sequence begins (or resumes if reset).
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
