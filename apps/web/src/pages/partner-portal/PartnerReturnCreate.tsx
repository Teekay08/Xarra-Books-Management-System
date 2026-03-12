import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { partnerApi, getPartnerUser, type PaginatedResponse } from '../../lib/partner-api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface ConsignmentLine {
  id: string;
  qtyDispatched: number;
  qtySold: number;
  qtyReturned: number;
  qtyDamaged: number;
  title?: { id: string; title: string; isbn13: string | null };
}

interface Consignment {
  id: string;
  proformaNumber: string | null;
  dispatchDate: string | null;
  createdAt: string;
  lines: ConsignmentLine[];
}

interface Branch {
  id: string;
  name: string;
}

interface ReturnLine {
  titleId: string;
  titleName: string;
  isbn: string;
  quantity: number;
  maxQuantity: number;
  condition: 'GOOD' | 'DAMAGED' | 'UNSALEABLE';
  reason: string;
}

export function PartnerReturnCreate() {
  const navigate = useNavigate();
  const user = getPartnerUser();

  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [consignmentId, setConsignmentId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isHqUser = !user?.branchId;

  const selectedConsignment = consignments.find((c) => c.id === consignmentId);

  // Available titles from selected consignment (only titles with returnable qty)
  const availableTitles = (selectedConsignment?.lines ?? [])
    .filter((l) => l.title && l.qtyDispatched - l.qtyReturned - l.qtyDamaged > 0)
    .map((l) => ({
      id: l.title!.id,
      title: l.title!.title,
      isbn13: l.title!.isbn13,
      maxQty: l.qtyDispatched - l.qtyReturned - l.qtyDamaged,
    }));

  useEffect(() => {
    async function fetchData() {
      try {
        const promises: Promise<any>[] = [
          partnerApi<PaginatedResponse<Consignment>>('/documents/consignments?limit=200'),
        ];

        if (isHqUser) {
          promises.push(partnerApi<{ data: Branch[] }>('/branches'));
        }

        const results = await Promise.all(promises);
        setConsignments(results[0].data);
        if (isHqUser && results[1]) {
          setBranches(results[1].data);
        }
      } catch {
        // errors handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isHqUser]);

  // When consignment changes, clear lines
  function handleConsignmentChange(newId: string) {
    setConsignmentId(newId);
    setLines([]);
    if (!isDirty) setIsDirty(true);
  }

  function addLine(title: { id: string; title: string; isbn13: string | null; maxQty: number }) {
    if (lines.some((l) => l.titleId === title.id)) return;
    setLines((prev) => [
      ...prev,
      {
        titleId: title.id,
        titleName: title.title,
        isbn: title.isbn13 ?? '',
        quantity: 1,
        maxQuantity: title.maxQty,
        condition: 'GOOD',
        reason: '',
      },
    ]);
    if (!isDirty) setIsDirty(true);
  }

  function updateLine(index: number, updates: Partial<ReturnLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...updates } : line))
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!consignmentId) {
      setError('Please select a consignment / SOR pro-forma invoice.');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for the return.');
      return;
    }

    if (lines.length === 0) {
      setError('Please add at least one title to return.');
      return;
    }

    const invalidLine = lines.find((l) => l.quantity < 1);
    if (invalidLine) {
      setError('All line quantities must be at least 1.');
      return;
    }

    const overLine = lines.find((l) => l.quantity > l.maxQuantity);
    if (overLine) {
      setError(`Quantity for "${overLine.titleName}" exceeds the available returnable quantity (${overLine.maxQuantity}).`);
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        consignmentId,
        reason: reason.trim(),
        lines: lines.map((l) => ({
          titleId: l.titleId,
          quantity: l.quantity,
          condition: l.condition,
          reason: l.reason.trim() || undefined,
        })),
        branchId: branchId || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await partnerApi<{ data: { id: string } }>('/returns', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });

      setIsDirty(false);
      navigate(`/partner/returns/${res.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit return request.');
    } finally {
      setSubmitting(false);
    }
  }

  // Filter available titles (exclude already-added ones)
  const titlesNotAdded = availableTitles.filter(
    (t) => !lines.some((l) => l.titleId === t.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Return Request</h1>
        <p className="mt-1 text-sm text-gray-500">
          Submit a request to return titles. Select the SOR pro-forma invoice the items were supplied on.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="space-y-6">
        {/* Return Details */}
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Return Details</h2>

          <div>
            <label htmlFor="consignment" className="block text-sm font-medium text-gray-700 mb-1">
              SOR Pro-Forma Invoice <span className="text-red-500">*</span>
            </label>
            <select
              id="consignment"
              value={consignmentId}
              onChange={(e) => handleConsignmentChange(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Select SOR pro-forma invoice --</option>
              {consignments.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.proformaNumber ?? 'SOR'} — {c.dispatchDate ? new Date(c.dispatchDate).toLocaleDateString('en-ZA') : new Date(c.createdAt).toLocaleDateString('en-ZA')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Return <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="Describe the reason for this return request..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {isHqUser && branches.length > 0 && (
            <div>
              <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-1">
                Branch (optional)
              </label>
              <select
                id="branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Select branch --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional information..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Titles to Return</h2>
          </div>

          {!consignmentId ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Select a SOR pro-forma invoice above to see available titles.
            </p>
          ) : titlesNotAdded.length > 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Available titles from this consignment:</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {titlesNotAdded.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addLine(t)}
                    className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-white transition-colors flex justify-between items-center"
                  >
                    <span>
                      <span className="font-medium text-gray-900">{t.title}</span>
                      <span className="ml-2 text-gray-500">({t.isbn13 ?? 'No ISBN'})</span>
                    </span>
                    <span className="text-xs text-gray-400">max {t.maxQty}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : lines.length === 0 ? (
            <p className="text-sm text-amber-600 text-center py-4">
              No returnable titles remaining on this consignment.
            </p>
          ) : null}

          {/* Line Items List */}
          {lines.length > 0 && (
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={line.titleId}
                  className="rounded-md border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{line.titleName}</p>
                      <p className="text-xs text-gray-500">ISBN: {line.isbn} | Max returnable: {line.maxQuantity}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Remove line"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Quantity (max {line.maxQuantity})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={line.maxQuantity}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: Math.max(1, Math.min(line.maxQuantity, parseInt(e.target.value) || 1)) })
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Condition
                      </label>
                      <select
                        value={line.condition}
                        onChange={(e) =>
                          updateLine(index, {
                            condition: e.target.value as ReturnLine['condition'],
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="GOOD">Good</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="UNSALEABLE">Unsaleable</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Line Reason (optional)
                      </label>
                      <input
                        type="text"
                        value={line.reason}
                        onChange={(e) => updateLine(index, { reason: e.target.value })}
                        placeholder="Reason for this item..."
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/partner/returns')}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            )}
            Submit Return Request
          </button>
        </div>
      </form>
    </div>
  );
}
