import { useState, useEffect } from 'react';
import { getPartnerUser } from '../../lib/partner-api';
import type { PartnerUser } from '../../lib/partner-api';

export function PartnerStatements() {
  const [user, setUser] = useState<PartnerUser | null>(null);

  useEffect(() => {
    setUser(getPartnerUser());
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Account Statements</h1>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex gap-3">
          <svg
            className="h-6 w-6 shrink-0 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="space-y-2 text-sm text-blue-800">
            <p className="font-semibold">
              Statements are generated and sent to your head office
              {user?.email ? (
                <>
                  {' '}
                  (<span className="font-medium">{user.email}</span>)
                </>
              ) : (
                ''
              )}
              .
            </p>
            <p>
              Contact Xarra Books to request a statement for a specific period.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Card */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Contact Xarra Books</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <div>
              <p className="text-gray-500">Email</p>
              <a
                href="mailto:info@xarrabooks.com"
                className="font-medium text-primary hover:underline"
              >
                info@xarrabooks.com
              </a>
            </div>
          </div>
          <p className="mt-4 text-gray-500">
            Please include your partner name and the date range you need the statement for in your
            request.
          </p>
        </div>
      </div>
    </div>
  );
}
