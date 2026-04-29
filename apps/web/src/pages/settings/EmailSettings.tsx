import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

interface EmailSettings {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  emailDomain?: string;
  replyToEmail?: string;
  fromName?: string;
}

export function EmailSettings() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => api<{ data: EmailSettings | null }>('/settings/email-settings'),
  });

  const mutation = useMutation({
    mutationFn: (body: EmailSettings) =>
      api('/settings/email-settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-settings'] });
      setSuccess('Email settings saved successfully');
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
    
    const body: EmailSettings = {
      smtpHost: fd.get('smtpHost') as string || undefined,
      smtpPort: fd.get('smtpPort') ? parseInt(fd.get('smtpPort') as string, 10) : undefined,
      smtpUser: fd.get('smtpUser') as string || undefined,
      smtpPassword: fd.get('smtpPassword') as string || undefined,
      smtpSecure: fd.get('smtpSecure') === 'on',
      emailDomain: fd.get('emailDomain') as string || undefined,
      replyToEmail: fd.get('replyToEmail') as string || undefined,
      fromName: fd.get('fromName') as string || undefined,
    };

    mutation.mutate(body);
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  
  const settings = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader 
        title="Email / SMTP Settings" 
        subtitle="Configure email server settings for sending invoices, statements, and notifications" 
      />

      {error && <div className="mb-4 max-w-3xl rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 max-w-3xl rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* SMTP Server Configuration */}
        <fieldset className="card p-4">
          <legend className="px-2 text-sm font-semibold text-gray-700">SMTP Server Configuration</legend>
          <p className="mb-4 text-xs text-gray-500">
            Configure your SMTP server settings. If left blank, the system will use the default Resend service.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  name="smtpHost"
                  defaultValue={settings?.smtpHost ?? ''}
                  className={cls}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Port
                </label>
                <input
                  type="number"
                  name="smtpPort"
                  min="1"
                  max="65535"
                  defaultValue={settings?.smtpPort ?? 587}
                  className={cls}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Username
                </label>
                <input
                  type="text"
                  name="smtpUser"
                  defaultValue={settings?.smtpUser ?? ''}
                  className={cls}
                  placeholder="your-email@domain.com"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="smtpPassword"
                    defaultValue={settings?.smtpPassword ?? ''}
                    className={cls}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="smtpSecure"
                id="smtpSecure"
                defaultChecked={settings?.smtpSecure ?? true}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="smtpSecure" className="ml-2 block text-sm text-gray-700">
                Use secure connection (TLS/SSL)
              </label>
            </div>
          </div>
        </fieldset>

        {/* Email Identity */}
        <fieldset className="card p-4">
          <legend className="px-2 text-sm font-semibold text-gray-700">Email Identity</legend>
          <p className="mb-4 text-xs text-gray-500">
            Configure how emails appear to recipients.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Name
              </label>
              <input
                type="text"
                name="fromName"
                defaultValue={settings?.fromName ?? ''}
                className={cls}
                placeholder="Xarra Books"
              />
              <p className="mt-1 text-xs text-gray-500">
                The name that appears in the "From" field of sent emails.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Domain
              </label>
              <input
                type="text"
                name="emailDomain"
                defaultValue={settings?.emailDomain ?? ''}
                className={cls}
                placeholder="xarrabooks.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                The domain used for sending emails (e.g., noreply@xarrabooks.com).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reply-To Email
              </label>
              <input
                type="email"
                name="replyToEmail"
                defaultValue={settings?.replyToEmail ?? ''}
                className={cls}
                placeholder="accounts@xarrabooks.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                The email address where replies should be sent.
              </p>
            </div>
          </div>
        </fieldset>

        {/* Help Text */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-blue-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">Common SMTP Settings:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><span className="font-medium">Gmail:</span> smtp.gmail.com, port 587 (TLS) or 465 (SSL)</li>
                <li><span className="font-medium">Outlook:</span> smtp-mail.outlook.com, port 587</li>
                <li><span className="font-medium">Office 365:</span> smtp.office365.com, port 587</li>
                <li><span className="font-medium">SendGrid:</span> smtp.sendgrid.net, port 587</li>
              </ul>
              <p className="mt-2 text-xs">
                Note: Some providers require app-specific passwords or OAuth2 authentication.
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save Email Settings'}
        </button>
      </form>
    </div>
  );
}
