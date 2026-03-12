import { useState, type FormEvent } from 'react';

interface VoidReasonModalProps {
  title: string;
  description?: string;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function VoidReasonModal({ title, description, isPending, onClose, onConfirm }: VoidReasonModalProps) {
  const [reason, setReason] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim()) onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Provide a reason for voiding this document..."
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending || !reason.trim()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {isPending ? 'Voiding...' : 'Void Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
