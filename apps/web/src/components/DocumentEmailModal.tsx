import { useState } from 'react';

interface DocumentEmailModalProps {
  /** Modal title, e.g. "Send Invoice" */
  title: string;
  /** Document number shown in the modal, e.g. "INV-2026-0012" */
  documentNumber: string;
  /** URL to the PDF endpoint (used for preview iframe) */
  pdfUrl: string;
  /** Default recipient email */
  defaultEmail: string;
  /** Default subject line */
  defaultSubject: string;
  /** Default message body */
  defaultMessage?: string;
  /** Whether the send mutation is in progress */
  isPending: boolean;
  /** Error message from the last send attempt */
  error?: string;
  /** Close the modal */
  onClose: () => void;
  /** Called when user clicks Send */
  onSend: (data: {
    email: string;
    cc: string;
    bcc: string;
    subject: string;
    message: string;
  }) => void;
}

export function DocumentEmailModal({
  title,
  documentNumber,
  pdfUrl,
  defaultEmail,
  defaultSubject,
  defaultMessage = '',
  isPending,
  error,
  onClose,
  onSend,
}: DocumentEmailModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Document: <span className="font-mono font-medium">{documentNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button
            onClick={() => setActiveTab('compose')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'compose'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Compose
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'preview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Document Preview
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {activeTab === 'compose' ? (
            <div className="space-y-4">
              {/* To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
                <div className="flex gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    placeholder="recipient@example.com"
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {!showCcBcc && (
                    <button
                      type="button"
                      onClick={() => setShowCcBcc(true)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
                    >
                      CC / BCC
                    </button>
                  )}
                </div>
              </div>

              {/* CC / BCC */}
              {showCcBcc && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                    <input
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      type="text"
                      placeholder="Comma-separated emails"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">BCC</label>
                    <input
                      value={bcc}
                      onChange={(e) => setBcc(e.target.value)}
                      type="text"
                      placeholder="Comma-separated emails"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Add a personal message to include in the email..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  The document PDF will be attached automatically.
                </p>
              </div>

              {/* Inline document preview thumbnail */}
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 rounded bg-red-100 p-2">
                    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{documentNumber}.pdf</p>
                    <p className="text-xs text-gray-500">PDF attachment</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(pdfUrl, '_blank')}
                    className="text-xs font-medium text-gray-600 hover:text-gray-700"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* PDF Preview */
            <div className="flex flex-col h-full min-h-[500px]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  Previewing: <span className="font-mono font-medium">{documentNumber}.pdf</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(pdfUrl, '_blank')}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Open in New Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const w = window.open(pdfUrl, '_blank');
                      w?.addEventListener('load', () => w.print());
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Print
                  </button>
                </div>
              </div>
              <iframe
                src={pdfUrl}
                className="flex-1 w-full rounded-md border border-gray-200 min-h-[500px]"
                title="Document Preview"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.open(pdfUrl, '_blank')}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => {
                const w = window.open(pdfUrl, '_blank');
                w?.addEventListener('load', () => w.print());
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSend({ email, cc, bcc, subject, message })}
              disabled={!email || isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
