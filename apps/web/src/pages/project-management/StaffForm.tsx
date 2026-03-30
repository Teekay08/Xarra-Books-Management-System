import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

const STAFF_SKILLS = [
  'EDITING',
  'TYPESETTING',
  'COVER_DESIGN',
  'PROOFREADING',
  'TRANSLATION',
  'MARKETING',
  'ILLUSTRATION',
  'INDEXING',
  'PROJECT_MANAGEMENT',
  'PHOTOGRAPHY',
  'COPYWRITING',
  'LAYOUT_DESIGN',
] as const;

const AVAILABILITY_TYPES = [
  { value: 'FULL_TIME', label: 'Full-Time' },
  { value: 'PART_TIME', label: 'Part-Time' },
  { value: 'CONTRACT', label: 'Contract' },
];

interface User {
  id: string;
  name: string;
  email: string;
}

export function StaffForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    skills: [] as string[],
    availabilityType: 'FULL_TIME',
    maxHoursPerWeek: 40,
    hourlyRate: 0,
    isInternal: true,
    userId: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const { data: existing } = useQuery({
    queryKey: ['pm-staff-member', id],
    queryFn: () => api<{ data: any }>(`/project-management/staff/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing?.data) {
      const s = existing.data;
      setForm({
        name: s.name || '',
        email: s.email || '',
        phone: s.phone || '',
        role: s.role || '',
        skills: s.skills || [],
        availabilityType: s.availabilityType || 'FULL_TIME',
        maxHoursPerWeek: Number(s.maxHoursPerWeek) || 40,
        hourlyRate: Number(s.hourlyRate) || 0,
        isInternal: !!s.isInternal,
        userId: s.userId || '',
        notes: s.notes || '',
      });
    }
  }, [existing]);

  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => api<{ data: User[] }>('/users?limit=500'),
  });

  function toggleSkill(skill: string) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        phone: form.phone || null,
        userId: form.userId || null,
        notes: form.notes || null,
      };

      if (isEdit) {
        return api(`/project-management/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        return api('/project-management/staff', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-staff'] });
      navigate('/pm/staff');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email) {
      setError('Name and email are required.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
        backTo={{ label: 'Staff Members', href: '/pm/staff' }}
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Contact Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Contact Details</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Role & Skills */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Role & Skills</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <input type="text" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="e.g. Senior Editor, Freelance Designer"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
            <div className="flex flex-wrap gap-2">
              {STAFF_SKILLS.map((skill) => (
                <label key={skill} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.skills.includes(skill)}
                    onChange={() => toggleSkill(skill)}
                    className="rounded border-gray-300 text-green-700 focus:ring-green-600"
                  />
                  <span className="text-sm text-gray-700">{skill.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Availability & Rate */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Availability & Rate</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Availability Type</label>
              <select value={form.availabilityType}
                onChange={(e) => setForm({ ...form, availabilityType: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                {AVAILABILITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours/Week</label>
              <input type="number" min={0} max={168} value={form.maxHoursPerWeek}
                onChange={(e) => setForm({ ...form, maxHoursPerWeek: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (ZAR)</label>
              <input type="number" min={0} step={0.01} value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isInternal}
              onChange={(e) => setForm({ ...form, isInternal: e.target.checked })}
              className="rounded border-gray-300 text-green-700 focus:ring-green-600" />
            <span className="text-sm text-gray-700">Is Internal Employee</span>
          </label>
        </div>

        {/* System User Link */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">System User Link</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link to System User (optional)</label>
            <select value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">-- None --</option>
              {usersData?.data?.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Links this staff profile to a system login for self-service features</p>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea rows={3} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Any additional notes about this staff member..." />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Staff' : 'Add Staff'}
          </button>
          <button type="button" onClick={() => navigate('/pm/staff')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
