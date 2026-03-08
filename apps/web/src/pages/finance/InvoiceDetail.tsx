import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { RecipientEditModal, type RecipientDetails } from '../../components/RecipientEditModal';

interface InvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  lineTax: string;
}

interface PaymentRecord {
  paymentId: string;
  amount: string;
  paymentDate: string;
  bankReference: string | null;
  paymentMethod: string | null;
}

interface Invoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  notes: string | null;
  purchaseOrderNumber: string | null;
  customerReference: string | null;
  paymentTermsText: string | null;
  sentAt: string | null;
  sentTo: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  amountPaid: string;
  creditNotesTotal: string;
  effectiveTotal: string;
  amountDue: string;
  partnerId: string;
  partner: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    vatNumber: string | null;
  };
  lines: InvoiceLine[];
  creditNotes?: { id: string; number: string; total: string; reason: string }[];
  paymentHistory?: PaymentRecord[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOIDED: 'bg-red-50 text-red-400',
};

function formatR(val: string | number) {
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showActions, setShowActions] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [cnError, setCnError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<{ data: Invoice }>(`/finance/invoices/${id}`),
  });

  const issueMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}/issue`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      api(`/finance/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const markSentMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}/mark-sent`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowActions(false);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api<{ data: { id: string } }>(`/finance/invoices/${id}/duplicate`, { method: 'POST' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/finance/invoices/${res.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/finance/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/finance/invoices'),
  });

  const sendMutation = useMutation({
    mutationFn: (body: { recipientEmail: string; subject?: string; message?: string }) =>
      api(`/finance/invoices/${id}/send`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowSendModal(false);
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (body: { partnerId: string; amount: number; paymentDate: string; paymentMethod: string; bankReference?: string; invoiceAllocations: { invoiceId: string; amount: number }[] }) =>
      api('/finance/payments', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowPaymentModal(false);
    },
  });

  const creditNoteMutation = useMutation({
    mutationFn: (body: { reason: string; lines: { invoiceLineId: string; quantity: number }[] }) => {
      // Map invoice line IDs to the full line details the backend expects
      const invData = data?.data;
      const apiLines = body.lines.map((cl) => {
        const invLine = invData?.lines.find((l) => l.id === cl.invoiceLineId);
        return {
          description: invLine?.description ?? '',
          quantity: cl.quantity,
          unitPrice: Number(invLine?.unitPrice ?? 0),
          discountPct: Number(invLine?.discountPct ?? 0),
        };
      });
      return api(`/finance/invoices/${id}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason, lines: apiLines }),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowCreditNoteModal(false);
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!data?.data) return <div className="py-12 text-center text-gray-400">Invoice not found</div>;

  const inv = data.data;
  const amountDue = Number(inv.amountDue ?? inv.total);
  const amountPaid = Number(inv.amountPaid ?? 0);
  const creditNotesTotal = Number(inv.creditNotesTotal ?? 0);

  return (
    <div>
      <PageHeader
        title={inv.number}
        subtitle={inv.partner.name}
        action={
          <div className="flex gap-2 items-center">
            {inv.status === 'DRAFT' && (
              <>
                <button onClick={() => navigate(`/finance/invoices/${id}/edit`)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Edit
                </button>
                <button onClick={() => issueMutation.mutate()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Issue Invoice
                </button>
              </>
            )}

            <a href={`/api/v1/finance/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              PDF
            </a>

            {/* More actions dropdown */}
            <div className="relative">
              <button onClick={() => setShowActions(!showActions)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>

              {showActions && (
                <div className="absolute right-0 mt-1 w-48 rounded-md bg-white shadow-lg border border-gray-200 z-50"
                  onMouseLeave={() => setShowActions(false)}>
                  {inv.status !== 'VOIDED' && (
                    <button onClick={() => { setShowSendModal(true); setShowActions(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Send via Email
                    </button>
                  )}
                  {!inv.sentAt && inv.status !== 'VOIDED' && (
                    <button onClick={() => markSentMutation.mutate()}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Mark as Sent
                    </button>
                  )}
                  {inv.status !== 'VOIDED' && inv.status !== 'DRAFT' && amountDue > 0 && (
                    <button onClick={() => { setShowPaymentModal(true); setShowActions(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Record Payment
                    </button>
                  )}
                  {inv.status !== 'VOIDED' && inv.status !== 'DRAFT' && (
                    <button onClick={() => { setShowCreditNoteModal(true); setShowActions(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      Credit Note
                    </button>
                  )}
                  <button onClick={() => { duplicateMutation.mutate(); setShowActions(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Duplicate
                  </button>
                  <button onClick={() => window.open(`/api/v1/finance/invoices/${id}/pdf`, '_blank')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Print
                  </button>
                  {inv.status !== 'VOIDED' && inv.status !== 'DRAFT' && (
                    <button onClick={() => {
                      const reason = prompt('Reason for voiding this invoice:');
                      if (reason) { voidMutation.mutate(reason); setShowActions(false); }
                    }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Void Invoice
                    </button>
                  )}
                  {inv.status === 'DRAFT' && (
                    <button onClick={() => {
                      if (confirm('Delete this draft invoice? This cannot be undone.')) {
                        deleteMutation.mutate(); setShowActions(false);
                      }
                    }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* Amount Due Banner */}
      {amountDue > 0 && inv.status !== 'VOIDED' && inv.status !== 'DRAFT' && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-amber-800 font-medium">Amount Due</p>
            <p className="text-2xl font-bold text-amber-900">{formatR(amountDue)}</p>
          </div>
          <button onClick={() => setShowPaymentModal(true)}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Record Payment
          </button>
        </div>
      )}

      {inv.status === 'PAID' && (
        <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800 font-medium">Fully Paid</p>
          <p className="text-2xl font-bold text-green-900">{formatR(inv.total)}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice meta */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Status</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[inv.status] ?? ''}`}>
                  {inv.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Invoice Date</span>
                <span>{new Date(inv.invoiceDate).toLocaleDateString('en-ZA')}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Due Date</span>
                <span>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-ZA') : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Partner</span>
                <span className="flex items-center gap-1.5">
                  {inv.partner.name}
                  <button onClick={() => setShowRecipientModal(true)} title="Edit recipient details"
                    className="text-gray-400 hover:text-green-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </span>
                {inv.partner.contactName && (
                  <span className="text-xs text-gray-400 block">{inv.partner.contactName}</span>
                )}
                {inv.partner.contactEmail && (
                  <span className="text-xs text-gray-400 block">{inv.partner.contactEmail}</span>
                )}
              </div>
              {inv.purchaseOrderNumber && (
                <div>
                  <span className="text-xs text-gray-500 block">PO Number</span>
                  <span>{inv.purchaseOrderNumber}</span>
                </div>
              )}
              {inv.customerReference && (
                <div>
                  <span className="text-xs text-gray-500 block">Customer Ref</span>
                  <span>{inv.customerReference}</span>
                </div>
              )}
              {inv.sentAt && (
                <div>
                  <span className="text-xs text-gray-500 block">Sent</span>
                  <span>{new Date(inv.sentAt).toLocaleDateString('en-ZA')}</span>
                  {inv.sentTo && <span className="text-xs text-gray-400 block">{inv.sentTo}</span>}
                </div>
              )}
            </div>

            {/* Line items table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Disc %</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inv.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2">{line.lineNumber}</td>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right font-mono">{line.quantity}</td>
                    <td className="py-2 text-right font-mono">{formatR(line.unitPrice)}</td>
                    <td className="py-2 text-right">{Number(line.discountPct)}%</td>
                    <td className="py-2 text-right font-mono">{formatR(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-72 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono">{formatR(inv.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">VAT (15%)</span>
                  <span className="font-mono">{formatR(inv.vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-bold text-base">
                  <span>Invoice Total</span>
                  <span className="font-mono">{formatR(inv.total)}</span>
                </div>
                {creditNotesTotal > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Credit Notes</span>
                    <span className="font-mono">- {formatR(creditNotesTotal)}</span>
                  </div>
                )}
                {amountPaid > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Payments Received</span>
                    <span className="font-mono">- {formatR(amountPaid)}</span>
                  </div>
                )}
                {(creditNotesTotal > 0 || amountPaid > 0) && (
                  <div className="flex justify-between border-t pt-1 font-bold text-base">
                    <span className={amountDue > 0 ? 'text-amber-700' : 'text-green-700'}>
                      Balance Due
                    </span>
                    <span className={`font-mono ${amountDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {formatR(amountDue)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Voided notice */}
          {inv.voidedReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">Voided</p>
              <p className="text-sm text-red-600 mt-1">{inv.voidedReason}</p>
            </div>
          )}

          {/* Payment History */}
          {inv.paymentHistory && inv.paymentHistory.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment History</h3>
              <div className="divide-y">
                {inv.paymentHistory.map((p, i) => (
                  <div key={i} className="py-2 flex justify-between text-sm">
                    <div>
                      <span className="text-gray-600">{new Date(p.paymentDate).toLocaleDateString('en-ZA')}</span>
                      <span className="text-gray-400 ml-2">{p.paymentMethod ?? 'EFT'}</span>
                      {p.bankReference && <span className="text-gray-400 ml-2">Ref: {p.bankReference}</span>}
                    </div>
                    <span className="font-mono text-green-700">{formatR(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit Notes */}
          {inv.creditNotes && inv.creditNotes.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Credit Notes</h3>
              <div className="divide-y">
                {inv.creditNotes.map((cn) => (
                  <div key={cn.id} className="py-2 flex justify-between text-sm">
                    <div>
                      <span className="font-mono">{cn.number}</span>
                      <span className="text-gray-500 ml-2">{cn.reason}</span>
                    </div>
                    <span className="font-mono text-red-600">-{formatR(cn.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {inv.notes && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{inv.notes}</p>
            </div>
          )}

          {inv.paymentTermsText && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Terms</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{inv.paymentTermsText}</p>
            </div>
          )}
        </div>
      </div>

      {/* Send Email Modal */}
      {showSendModal && (
        <SendEmailModal
          defaultEmail={inv.partner.contactEmail ?? ''}
          invoiceNumber={inv.number}
          isPending={sendMutation.isPending}
          error={sendMutation.isError ? (sendMutation.error as Error).message : ''}
          onClose={() => setShowSendModal(false)}
          onSend={(email, subject, message) => sendMutation.mutate({ recipientEmail: email, subject, message })}
        />
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <RecordPaymentModal
          invoiceId={inv.id}
          partnerId={(inv as any).partnerId ?? ''}
          amountDue={amountDue}
          isPending={paymentMutation.isPending}
          onClose={() => setShowPaymentModal(false)}
          onSubmit={(amount, method, ref, date) => {
            paymentMutation.mutate({
              partnerId: (inv as any).partnerId,
              amount,
              paymentDate: date,
              paymentMethod: method,
              bankReference: ref || undefined,
              invoiceAllocations: [{ invoiceId: inv.id, amount }],
            });
          }}
        />
      )}

      {/* Credit Note Modal */}
      {showCreditNoteModal && (
        <CreditNoteModal
          lines={inv.lines}
          error={cnError}
          isPending={creditNoteMutation.isPending}
          onClose={() => { setShowCreditNoteModal(false); setCnError(''); }}
          onSubmit={(reason, lines) => {
            setCnError('');
            creditNoteMutation.mutate({ reason, lines }, { onError: (err) => setCnError(err.message) });
          }}
        />
      )}

      {/* Recipient Edit Modal */}
      {showRecipientModal && (
        <RecipientEditModal
          recipient={{
            partnerId: inv.partnerId ?? inv.partner.id,
            partnerName: inv.partner.name,
            contactName: inv.partner.contactName,
            contactEmail: inv.partner.contactEmail,
            contactPhone: inv.partner.contactPhone,
            addressLine1: inv.partner.addressLine1,
            addressLine2: inv.partner.addressLine2,
            city: inv.partner.city,
            province: inv.partner.province,
            postalCode: inv.partner.postalCode,
            vatNumber: inv.partner.vatNumber,
          }}
          onClose={() => setShowRecipientModal(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['invoice', id] })}
        />
      )}
    </div>
  );
}

function SendEmailModal({ defaultEmail, invoiceNumber, isPending, error, onClose, onSend }: {
  defaultEmail: string;
  invoiceNumber: string;
  isPending: boolean;
  error: string;
  onClose: () => void;
  onSend: (email: string, subject: string, message: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState(`Invoice ${invoiceNumber} from Xarra Books`);
  const [message, setMessage] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Send Invoice via Email</h3>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email *</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Optional message to include..." />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => email && onSend(email, subject, message)} disabled={!email || isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {isPending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentModal({ invoiceId, partnerId, amountDue, isPending, onClose, onSubmit }: {
  invoiceId: string;
  partnerId: string;
  amountDue: number;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (amount: number, method: string, ref: string, date: string) => void;
}) {
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" min="0.01"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="BANK_TRANSFER">Bank Transfer / EFT</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bank Reference</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSubmit(Number(amount), method, ref, date)} disabled={!amount || isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {isPending ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditNoteModal({ lines, error, isPending, onClose, onSubmit }: {
  lines: InvoiceLine[];
  error: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (reason: string, lines: { invoiceLineId: string; quantity: number }[]) => void;
}) {
  const [reason, setReason] = useState('');
  const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cnLines = Object.entries(selectedLines)
      .filter(([, qty]) => qty > 0)
      .map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity }));
    if (cnLines.length === 0) return;
    onSubmit(reason, cnLines);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Create Credit Note</h3>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Damaged goods returned" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select line items to credit</label>
            <div className="border rounded-md divide-y">
              {lines.map((line) => (
                <div key={line.id} className="flex items-center gap-3 px-3 py-2">
                  <input type="number" min={0} max={Number(line.quantity)}
                    value={selectedLines[line.id] ?? 0}
                    onChange={(e) => setSelectedLines((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                  <div className="flex-1 text-sm">
                    <span className="text-gray-900">{line.description}</span>
                    <span className="text-gray-500 ml-2">({line.quantity} x R {Number(line.unitPrice).toFixed(2)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isPending ? 'Creating...' : 'Create Credit Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
