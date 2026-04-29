import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface RoyaltyEntry {
  id: string;
  periodFrom: string;
  periodTo: string;
  unitsSold: number;
  netPayable: string;
  status: string;
}

interface ContractDetail {
  id: string;
  titleId: string;
  royaltyRatePrint: string;
  royaltyRateEbook: string | null;
  triggerType: string;
  triggerValue: string | null;
  advanceAmount: string;
  advanceRecovered: string;
  advanceRemaining: number;
  isSigned: boolean;
  signedAt: string | null;
  signedByIp: string | null;
  startDate: string;
  endDate: string | null;
  paymentFrequency: string;
  contractTerms: string | null;
  contractTermsSnapshot: string | null;
  contractTemplateId: string | null;
  title: { title: string; isbn13: string | null; format?: string };
  template: { name: string; authorType: string; version: string } | null;
  royaltyHistory: RoyaltyEntry[];
}

export function PortalContractDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-contract', id],
    queryFn: () => api<{ data: ContractDetail }>(`/portal/contracts/${id}`),
  });

  const signMut = useMutation({
    mutationFn: () => api(`/portal/contracts/${id}/sign`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-contract', id] });
      queryClient.invalidateQueries({ queryKey: ['portal-contracts'] });
      setShowSignConfirm(false);
      setAgreed(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Contract not found.</div>;

  const c = data.data;
  const advance = Number(c.advanceAmount);
  const recovered = Number(c.advanceRecovered);
  const pct = advance > 0 ? Math.min(100, (recovered / advance) * 100) : 100;
  const hasTerms = !!c.contractTerms;

  return (
    <div>
      <Link to="/portal/contracts" className="text-sm text-green-700 hover:underline mb-4 inline-block">
        &larr; Back to Contracts
      </Link>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">{c.title?.title ?? 'Unknown Title'}</h1>
        <div className="flex items-center gap-2">
          {c.isSigned ? (
            <span className="inline-flex rounded-full px-3 py-1 text-sm font-medium bg-green-100 text-green-700">
              Signed
            </span>
          ) : hasTerms ? (
            <span className="inline-flex rounded-full px-3 py-1 text-sm font-medium bg-amber-100 text-amber-700">
              Awaiting Signature
            </span>
          ) : (
            <span className="inline-flex rounded-full px-3 py-1 text-sm font-medium bg-gray-100 text-gray-700">
              Draft
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-6">
        {c.title?.isbn13 && <span className="text-sm text-gray-500">ISBN: {c.title.isbn13}</span>}
        {c.template && (
          <span className="text-sm text-gray-500">
            Template: {c.template.name} (v{c.template.version})
          </span>
        )}
      </div>

      {/* Contract Terms Section */}
      {hasTerms && (
        <div className="card mb-6">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Contract Terms & Conditions</h3>
            {c.isSigned && c.signedAt && (
              <span className="text-xs text-green-600">
                Signed on {new Date(c.signedAt).toLocaleDateString('en-ZA', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            )}
          </div>
          <div className="p-5 max-h-[500px] overflow-y-auto">
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: c.contractTerms! }}
            />
          </div>

          {/* Signing action */}
          {!c.isSigned && (
            <div className="p-5 border-t border-gray-200 bg-amber-50">
              {!showSignConfirm ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-amber-800">
                    Please review the terms above carefully, then click to sign.
                  </p>
                  <button
                    onClick={() => setShowSignConfirm(true)}
                    className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
                  >
                    Sign This Contract
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="agreeTerms"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <label htmlFor="agreeTerms" className="text-sm text-gray-700">
                      I have read and understood the contract terms above, and I agree to be bound by them. 
                      I understand that this electronic signature is legally binding.
                    </label>
                  </div>
                  {signMut.isError && (
                    <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                      {(signMut.error as Error).message}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => signMut.mutate()}
                      disabled={!agreed || signMut.isPending}
                      className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {signMut.isPending ? 'Signing...' : 'Confirm & Sign'}
                    </button>
                    <button
                      onClick={() => { setShowSignConfirm(false); setAgreed(false); }}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Signing details if signed */}
      {c.isSigned && c.signedAt && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="text-sm font-semibold text-green-800">Contract Signed</h4>
          </div>
          <p className="text-sm text-green-700">
            Signed on {new Date(c.signedAt).toLocaleDateString('en-ZA', {
              day: 'numeric', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contract Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Print Royalty Rate</dt>
              <dd className="font-medium">{(Number(c.royaltyRatePrint) * 100).toFixed(1)}%</dd>
            </div>
            {c.royaltyRateEbook && (
              <div className="flex justify-between">
                <dt className="text-gray-500">E-book Royalty Rate</dt>
                <dd className="font-medium">{(Number(c.royaltyRateEbook) * 100).toFixed(1)}%</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Trigger Type</dt>
              <dd className="font-medium">{c.triggerType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Payment Frequency</dt>
              <dd className="font-medium">{c.paymentFrequency?.replace(/_/g, ' ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Start Date</dt>
              <dd className="font-medium">{new Date(c.startDate).toLocaleDateString()}</dd>
            </div>
            {c.endDate && (
              <div className="flex justify-between">
                <dt className="text-gray-500">End Date</dt>
                <dd className="font-medium">{new Date(c.endDate).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>

        {advance > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Advance Recovery</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Advance</span>
                <span className="font-medium">R {advance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Recovered</span>
                <span className="font-medium text-green-600">R {recovered.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Remaining</span>
                <span className="font-medium text-amber-600">R {c.advanceRemaining.toFixed(2)}</span>
              </div>
              <div>
                <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-right">{pct.toFixed(1)}% recovered</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Royalty Entries</h2>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(c.royaltyHistory ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {new Date(r.periodFrom).toLocaleDateString()} – {new Date(r.periodTo).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{r.unitsSold}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                  R {Number(r.netPayable).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'PAID'
                        ? 'bg-green-100 text-green-700'
                        : r.status === 'APPROVED'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {(c.royaltyHistory ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  No royalty entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
