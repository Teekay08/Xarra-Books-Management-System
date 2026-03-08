import { useEffect, useState } from 'react';
import { partnerApi, getPartnerUser, type PartnerUser } from '../../lib/partner-api';

interface PartnerInfo {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  discountRate: number;
  paymentTerms: number;
  sorDays: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  contact: string;
}

export function PartnerAccount() {
  const user = getPartnerUser();
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    async function fetchAccountData() {
      setLoading(true);
      try {
        const [partnerRes, branchesRes] = await Promise.all([
          partnerApi<{ data: PartnerInfo }>('/account/partner'),
          partnerApi<{ data: Branch[] }>('/account/branches'),
        ]);
        setPartner(partnerRes.data);
        setBranches(branchesRes.data);
      } catch {
        // errors handled by partnerApi (401 redirect, etc.)
      } finally {
        setLoading(false);
      }
    }
    fetchAccountData();
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await partnerApi('/account/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your account details and partner information.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Info Card */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Name</dt>
              <dd className="text-sm font-medium text-gray-900">{user?.name ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Email</dt>
              <dd className="text-sm font-medium text-gray-900">{user?.email ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Role</dt>
              <dd className="text-sm font-medium text-gray-900">{user?.role ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Partner</dt>
              <dd className="text-sm font-medium text-gray-900">{user?.partnerName ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Branch</dt>
              <dd className="text-sm font-medium text-gray-900">{user?.branchName ?? '-'}</dd>
            </div>
          </dl>
        </div>

        {/* Partner Info Card */}
        {partner && (
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Partner Information</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Partner Name</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Contact Email</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.contactEmail}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Contact Phone</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.contactPhone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Address</dt>
                <dd className="text-sm font-medium text-gray-900 text-right max-w-[60%]">
                  {partner.address}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Discount Rate</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.discountRate}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Payment Terms</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.paymentTerms} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">SOR Days</dt>
                <dd className="text-sm font-medium text-gray-900">{partner.sorDays} days</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* Branches List */}
      {branches.length > 0 && (
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Branches</h2>
            <p className="mt-1 text-sm text-gray-500">
              All branches under your partner account.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Code</th>
                  <th className="px-6 py-3 font-medium">City</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr
                    key={branch.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {branch.name}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{branch.code}</td>
                    <td className="px-6 py-3 text-gray-600">{branch.city}</td>
                    <td className="px-6 py-3 text-gray-600">{branch.contact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Change Password */}
      <div className="rounded-lg border bg-white p-6 shadow-sm max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {passwordError && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-green-600">{passwordSuccess}</p>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
