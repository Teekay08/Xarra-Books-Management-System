import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { partnerApi, getPartnerUser, type PaginatedResponse } from '../../lib/partner-api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface Consignment {
  id: string;
  dispatchDate: string | null;
  createdAt: string;
}

interface CatalogTitle {
  id: string;
  title: string;
  isbn13: string | null;
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
  condition: 'GOOD' | 'DAMAGED' | 'UNSALEABLE';
  reason: string;
}

export function PartnerReturnCreate() {
  const navigate = useNavigate();
  const user = getPartnerUser();

  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [titles, setTitles] = useState<CatalogTitle[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [consignmentId, setConsignmentId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');

  const [showTitleSelector, setShowTitleSelector] = useState(false);
  const [titleSearch, setTitleSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isHqUser = !user?.branchId;

  useEffect(() => {
    async function fetchData() {
      try {
        const promises: Promise<any>[] = [
          partnerApi<PaginatedResponse<Consignment>>('/documents/consignments?limit=50'),
          partnerApi<PaginatedResponse<CatalogTitle>>('/catalog?limit=100'),
        ];

        if (isHqUser) {
          promises.push(partnerApi<{ data: Branch[] }>('/branches'));
        }

        const results = await Promise.all(promises);
        setConsignments(results[0].data);
        setTitles(results[1].data);
        if (isHqUser && results[2]) {
          setBranches(results[2].data);
        }
      } catch {
        // errors handled by partnerApi
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isHqUser]);

  function addLine(title: CatalogTitle) {
    if (lines.some((l) => l.titleId === title.id)) return;
    setLines((prev) => [
      ...prev,
      {
        titleId: title.id,
        titleName: title.title,
        isbn: title.isbn13 ?? '',
        quantity: 1,
        condition: 'GOOD',
        reason: '',
      },
    ]);
    setShowTitleSelector(false);
    setTitleSearch('');
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

    setSubmitting(true);
    try {
      const payload = {
        consignmentId: consignmentId || undefined,
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
      });

      setIsDirty(false);
      navigate(`/partner/returns/${res.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit return request.');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredTitles = titles.filter(
    (t) =>
      !lines.some((l) => l.titleId === t.id) &&
      (t.title.toLowerCase().includes(titleSearch.toLowerCase()) ||
        (t.isbn13 ?? '').toLowerCase().includes(titleSearch.toLowerCase()))
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
          Submit a request to return titles. All returns are subject to review and approval.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="space-y-6">
        {/* Consignment Reference */}
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Return Details</h2>

          <div>
            <label htmlFor="consignment" className="block text-sm font-medium text-gray-700 mb-1">
              Consignment Reference (optional)
            </label>
            <select
              id="consignment"
              value={consignmentId}
              onChange={(e) => setConsignmentId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- No consignment --</option>
              {consignments.map((c) => (
                <option key={c.id} value={c.id}>
                  Consignment ({c.dispatchDate ? new Date(c.dispatchDate).toLocaleDateString('en-ZA') : new Date(c.createdAt).toLocaleDateString('en-ZA')})
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
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
            <button
              type="button"
              onClick={() => setShowTitleSelector(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Title
            </button>
          </div>

          {/* Title Selector Modal */}
          {showTitleSelector && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Select a title to add</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowTitleSelector(false);
                    setTitleSearch('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <input
                type="text"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                placeholder="Search by title or ISBN..."
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredTitles.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2 text-center">No matching titles found.</p>
                ) : (
                  filteredTitles.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addLine(t)}
                      className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-white transition-colors"
                    >
                      <span className="font-medium text-gray-900">{t.title}</span>
                      <span className="ml-2 text-gray-500">({t.isbn13 ?? 'No ISBN'})</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Line Items List */}
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              No items added yet. Click "Add Title" to begin.
            </p>
          ) : (
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={line.titleId}
                  className="rounded-md border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{line.titleName}</p>
                      <p className="text-xs text-gray-500">ISBN: {line.isbn}</p>
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
                        Quantity
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
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
