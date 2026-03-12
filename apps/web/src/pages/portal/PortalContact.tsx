import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function PortalContact() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      api('/portal/contact', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      }),
    onSuccess: () => {
      setSent(true);
      setSubject('');
      setMessage('');
    },
  });

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    send.mutate();
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Contact Xarra</h1>
      <p className="text-sm text-gray-500 mb-6">
        Send a message to the Xarra team. We'll respond to your registered email address.
      </p>

      {sent && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 mb-6">
          Your message has been sent. We'll get back to you shortly.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Question about my royalty statement"
            className={cls}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Describe your question or concern..."
            className={cls}
            required
          />
        </div>

        {send.isError && (
          <p className="text-sm text-red-600">Failed to send message. Please try again.</p>
        )}

        <button
          type="submit"
          disabled={send.isPending || !subject.trim() || !message.trim()}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {send.isPending ? 'Sending...' : 'Send Message'}
        </button>
      </form>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-gray-500 font-medium uppercase mb-2">Other ways to reach us</p>
        <p className="text-sm text-gray-600">
          Email: <a href="mailto:authors@xarrabooks.co.za" className="text-green-700 hover:underline">authors@xarrabooks.co.za</a>
        </p>
      </div>
    </div>
  );
}
