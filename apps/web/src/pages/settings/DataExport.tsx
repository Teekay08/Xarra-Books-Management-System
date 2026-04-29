import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { downloadFromApi, exportUrl } from '../../lib/export';
import { DateRangeExportModal } from '../../components/DateRangeExportModal';

interface ExportItem {
  label: string;
  description: string;
  endpoint: string;
  filename: string;
  hasDateRange?: boolean;
}

const exportItems: ExportItem[] = [
  { label: 'Titles', description: 'All book titles with author, pricing, and metadata', endpoint: '/export/titles', filename: 'titles-export.csv' },
  { label: 'Authors', description: 'Author profiles, contact info, and tax details', endpoint: '/export/authors', filename: 'authors-export.csv' },
  { label: 'Retail Partners', description: 'Partner details, discount rates, and payment terms', endpoint: '/export/partners', filename: 'partners-export.csv' },
  { label: 'Invoices', description: 'All invoices with partner, dates, amounts, and status', endpoint: '/export/invoices', filename: 'invoices-export.csv', hasDateRange: true },
  { label: 'Invoice Lines', description: 'Individual line items across all invoices', endpoint: '/export/invoice-lines', filename: 'invoice-lines-export.csv', hasDateRange: true },
  { label: 'Quotations', description: 'All quotations with partner and amounts', endpoint: '/export/quotations', filename: 'quotations-export.csv', hasDateRange: true },
  { label: 'Purchase Orders', description: 'All purchase orders with supplier details', endpoint: '/export/purchase-orders', filename: 'purchase-orders-export.csv', hasDateRange: true },
  { label: 'Credit Notes', description: 'All credit notes with invoice references', endpoint: '/export/credit-notes', filename: 'credit-notes-export.csv', hasDateRange: true },
  { label: 'Debit Notes', description: 'All debit notes with invoice references', endpoint: '/export/debit-notes', filename: 'debit-notes-export.csv', hasDateRange: true },
  { label: 'Payments', description: 'Payment records with partner and bank references', endpoint: '/export/payments', filename: 'payments-export.csv', hasDateRange: true },
  { label: 'Remittances', description: 'Remittance advice from partners', endpoint: '/export/remittances', filename: 'remittances-export.csv', hasDateRange: true },
  { label: 'Consignments', description: 'Consignment shipments to partners', endpoint: '/export/consignments', filename: 'consignments-export.csv', hasDateRange: true },
  { label: 'Consignment Lines', description: 'Line items with dispatch, sold, and return quantities', endpoint: '/export/consignment-lines', filename: 'consignment-lines-export.csv', hasDateRange: true },
  { label: 'Inventory', description: 'Current stock levels per title', endpoint: '/export/inventory', filename: 'inventory-export.csv' },
  { label: 'Inventory Movements', description: 'Full movement history (receives, adjustments, sales)', endpoint: '/export/inventory-movements', filename: 'inventory-movements-export.csv', hasDateRange: true },
  { label: 'Returns', description: 'Return authorizations from partners', endpoint: '/export/returns', filename: 'returns-export.csv', hasDateRange: true },
  { label: 'Cash Sales', description: 'Walk-in cash sales with payment method', endpoint: '/export/cash-sales', filename: 'cash-sales-export.csv', hasDateRange: true },
  { label: 'Expenses', description: 'Operating expenses by category', endpoint: '/export/expenses', filename: 'expenses-export.csv', hasDateRange: true },
  { label: 'Expense Claims', description: 'Staff expense claims and approval status', endpoint: '/export/expense-claims', filename: 'expense-claims-export.csv', hasDateRange: true },
  { label: 'Requisitions', description: 'Purchase requisitions and approval status', endpoint: '/export/requisitions', filename: 'requisitions-export.csv', hasDateRange: true },
  { label: 'Sale Records', description: 'Normalized sales from all channels (website, KDP, Takealot)', endpoint: '/export/sale-records', filename: 'sale-records-export.csv', hasDateRange: true },
  { label: 'Royalty Ledger', description: 'Author royalty entries and calculations', endpoint: '/export/royalty-ledger', filename: 'royalty-ledger-export.csv', hasDateRange: true },
];

export function DataExport() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fullExporting, setFullExporting] = useState(false);
  const [dateRangeItem, setDateRangeItem] = useState<ExportItem | null>(null);

  async function handleExport(item: ExportItem, from?: string, to?: string) {
    setDownloading(item.endpoint);
    setError('');
    try {
      const url = item.hasDateRange ? exportUrl(item.endpoint, from, to) : item.endpoint;
      await downloadFromApi(url, item.filename);
    } catch (err: any) {
      setError(`Failed to export ${item.label}: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleFullExport() {
    setFullExporting(true);
    setError('');
    try {
      await downloadFromApi('/export/full', `xarra-books-full-export-${new Date().toISOString().split('T')[0]}.json`);
    } catch (err: any) {
      setError(`Full export failed: ${err.message}`);
    } finally {
      setFullExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Data Export"
        subtitle="Export data for backup, migration, or external analysis"
      />

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</div>}

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">Full System Export (JSON)</h3>
        <p className="text-sm text-blue-700 mb-3">
          Download all system data as a single JSON file. Suitable for full data migration to another system.
          Includes all records with their internal IDs and relationships preserved.
        </p>
        <button
          onClick={handleFullExport}
          disabled={fullExporting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {fullExporting ? 'Exporting...' : 'Download Full Export (JSON)'}
        </button>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-3">Individual Exports (CSV)</h3>
      <p className="text-sm text-gray-500 mb-4">
        Download individual data sets as CSV files. Compatible with Excel, Google Sheets, and most accounting software.
      </p>

      <div className="grid gap-3">
        {exportItems.map((item) => (
          <div
            key={item.endpoint}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-500">{item.description}</p>
            </div>
            <button
              onClick={() => item.hasDateRange ? setDateRangeItem(item) : handleExport(item)}
              disabled={downloading === item.endpoint}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 shrink-0"
            >
              {downloading === item.endpoint ? 'Downloading...' : 'Download CSV'}
            </button>
          </div>
        ))}
      </div>

      <DateRangeExportModal
        open={dateRangeItem !== null}
        onClose={() => setDateRangeItem(null)}
        onExport={(from, to) => {
          if (dateRangeItem) handleExport(dateRangeItem, from, to);
        }}
        title={dateRangeItem ? `Export ${dateRangeItem.label}` : 'Export'}
      />
    </div>
  );
}
