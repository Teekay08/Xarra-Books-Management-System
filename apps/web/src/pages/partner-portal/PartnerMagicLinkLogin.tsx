import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { setPartnerToken, setPartnerUser } from '../../lib/partner-api';

export function PartnerMagicLinkLogin() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('Invalid link — no token provided.');
      setStatus('error');
      return;
    }

    async function activate() {
      try {
        const res = await fetch(`/api/v1/order-tracking/magic-links/${token}/use`, {
          method: 'POST',
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 400 && body.message?.includes('already been used')) {
            // Link already used — let them try to log in normally
            navigate('/partner/login?reason=link-used');
            return;
          }
          throw new Error(body.message || body.error || 'This link is invalid or has expired.');
        }

        const json = await res.json();
        const { sessionToken, partnerUser, referenceType, referenceId } = json.data;

        // Establish partner session
        setPartnerToken(sessionToken);
        setPartnerUser(partnerUser);

        // Navigate to the relevant page
        if (referenceType === 'PARTNER_ORDER' && referenceId) {
          navigate(`/partner/orders/${referenceId}`, { replace: true });
        } else {
          navigate('/partner', { replace: true });
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'This link is no longer valid.');
        setStatus('error');
      }
    }

    activate();
  }, [token, navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="inline-block w-8 h-8 border-4 border-[#8B1A1A] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Opening your order&hellip;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center space-y-4">
        <div className="text-4xl">&#128274;</div>
        <h1 className="text-xl font-semibold text-gray-900">Link not valid</h1>
        <p className="text-sm text-gray-600">{errorMsg}</p>
        <p className="text-sm text-gray-500">
          If you have portal login credentials, you can{' '}
          <a href="/partner/login" className="text-[#8B1A1A] hover:underline font-medium">
            sign in here
          </a>
          . Otherwise contact Xarra Books for a new link.
        </p>
      </div>
    </div>
  );
}
