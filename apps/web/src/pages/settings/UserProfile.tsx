import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

export function UserProfile() {
  const queryClient = useQueryClient();
  const [profileMsg, setProfileMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<{ data: { id: string; name: string; email: string; role: string; preferences?: Record<string, unknown> } }>('/profile'),
  });

  const updateProfile = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setProfileMsg('Profile updated');
      setTimeout(() => setProfileMsg(''), 3000);
    },
  });

  function handleProfileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileMsg('');
    const fd = new FormData(e.currentTarget);
    updateProfile.mutate(
      { name: fd.get('name') },
      { onError: (err) => setProfileMsg(err.message) },
    );
  }

  function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwMsg('');
    const fd = new FormData(e.currentTarget);
    const currentPassword = fd.get('currentPassword') as string;
    const newPassword = fd.get('newPassword') as string;
    const confirm = fd.get('confirmPassword') as string;

    if (newPassword !== confirm) {
      setPwMsg('Passwords do not match');
      return;
    }

    // Use Better Auth's change-password endpoint
    fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(res => {
      if (res.ok) {
        setPwMsg('Password changed successfully');
        (e.target as HTMLFormElement).reset();
      } else {
        setPwMsg('Failed to change password. Check current password.');
      }
    });
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  const profile = data?.data;
  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

  return (
    <div>
      <PageHeader title="User Profile" subtitle="Manage your account" />

      <div className="max-w-xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Profile Information</h3>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {profileMsg && (
              <div className={`rounded-md p-3 text-sm ${profileMsg.includes('updated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {profileMsg}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input name="name" defaultValue={profile?.name ?? ''} className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={profile?.email ?? ''} disabled className={`${cls} bg-gray-50`} />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <input value={profile?.role ?? ''} disabled className={`${cls} bg-gray-50`} />
            </div>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {updateProfile.isPending ? 'Saving...' : 'Update Profile'}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Change Password</h3>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {pwMsg && (
              <div className={`rounded-md p-3 text-sm ${pwMsg.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {pwMsg}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input name="currentPassword" type="password" required className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input name="newPassword" type="password" required minLength={8} className={cls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input name="confirmPassword" type="password" required minLength={8} className={cls} />
            </div>
            <button
              type="submit"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
