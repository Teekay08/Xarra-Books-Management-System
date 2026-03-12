interface FinancialSummaryProps {
  subtotal: string | number;
  vatAmount: string | number;
  total: string | number;
  vatLabel?: string;
}

export function FinancialSummary({ subtotal, vatAmount, total, vatLabel = 'VAT (15%)' }: FinancialSummaryProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Financial Summary</h3>
      <div className="w-72 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-mono">R {Number(subtotal).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{vatLabel}</span>
          <span className="font-mono">R {Number(vatAmount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-bold text-base">
          <span>Total</span>
          <span className="font-mono">R {Number(total).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
