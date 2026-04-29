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

const JOB_FUNCTIONS = [
  { value: '', label: '— Not specified —' },
  { group: 'Executive', options: [
    { value: 'ceo', label: 'CEO' }, { value: 'cto', label: 'CTO' },
    { value: 'coo', label: 'COO' }, { value: 'finance_director', label: 'Finance Director' },
    { value: 'managing_director', label: 'Managing Director' },
  ]},
  { group: 'Project Management', options: [
    { value: 'project_manager', label: 'Project Manager' },
    { value: 'programme_manager', label: 'Programme Manager' },
    { value: 'portfolio_manager', label: 'Portfolio Manager' },
  ]},
  { group: 'Technical', options: [
    { value: 'developer', label: 'Developer' },
    { value: 'senior_developer', label: 'Senior Developer' },
    { value: 'tech_lead', label: 'Tech Lead' },
    { value: 'architect', label: 'Architect' },
    { value: 'devops_engineer', label: 'DevOps Engineer' },
  ]},
  { group: 'Analysis', options: [
    { value: 'business_analyst', label: 'Business Analyst' },
    { value: 'systems_analyst', label: 'Systems Analyst' },
    { value: 'data_analyst', label: 'Data Analyst' },
  ]},
  { group: 'QA / Testing', options: [
    { value: 'qa_engineer', label: 'QA Engineer' },
    { value: 'test_analyst', label: 'Test Analyst' },
    { value: 'uat_coordinator', label: 'UAT Coordinator' },
  ]},
  { group: 'Design', options: [
    { value: 'ux_designer', label: 'UX Designer' },
    { value: 'ui_designer', label: 'UI Designer' },
    { value: 'graphic_designer', label: 'Graphic Designer' },
  ]},
  { group: 'Content / Publishing', options: [
    { value: 'editor', label: 'Editor' },
    { value: 'typesetter', label: 'Typesetter' },
    { value: 'copywriter', label: 'Copywriter' },
    { value: 'proofreader', label: 'Proofreader' },
    { value: 'cover_designer', label: 'Cover Designer' },
  ]},
  { group: 'Administration', options: [
    { value: 'project_admin', label: 'Project Admin' },
    { value: 'executive_assistant', label: 'Executive Assistant' },
  ]},
  { group: 'External', options: [
    { value: 'client_representative', label: 'Client Representative' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'contractor', label: 'Contractor' },
  ]},
  { group: 'Other', options: [{ value: 'other', label: 'Other' }]},
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
    jobFunction: '',
    displayTitle: '',
    skills: [] as string[],
    availabilityType: 'FULL_TIME',
    maxHoursPerMonth: 160,
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
        role:         s.role         || '',
        jobFunction:  s.jobFunction  || '',
        displayTitle: s.displayTitle || '',
        skills: s.skills || [],
        availabilityType: s.availabilityType || 'FULL_TIME',
        maxHoursPerMonth: Number(s.maxHoursPerMonth) || 160,
        hourlyRate: Number(s.hourlyRate) || 0,
        isInternal: !!s.isInternal,
        userId: s.userId || '',
        notes: s.notes || '',
      });
    }
  }, [existing]);

  // Only fetch users list when editing (to show linked user) — PMs may not have access to /users
  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => api<{ data: User[] }>('/users?limit=500'),
    enabled: isEdit,
    retry: false,
  });

  function toggleSkill(skill: string) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));
  }

  const [successMsg, setSuccessMsg] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        phone: form.phone || null,
        userId: form.userId || null,
        notes: form.notes || null,
      };

      if (isEdit) {
        return api<{ data: any; accountCreated?: boolean }>(`/project-management/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        return api<{ data: any; accountCreated?: boolean }>('/project-management/staff', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        });
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pm-staff'] });
      if (result?.accountCreated) {
        setSuccessMsg(`Staff member added. A system account was created for ${form.email} — they'll receive a password setup email.`);
        setTimeout(() => navigate('/pm/staff'), 3000);
      } else {
        navigate('/pm/staff');
      }
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

      {successMsg && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">{successMsg}</div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Function</label>
            <p className="text-xs text-gray-500 mb-1.5">Drives the suggested role when adding this person to a Billetterie project</p>
            <select value={form.jobFunction}
              onChange={(e) => setForm({ ...form, jobFunction: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">— Not specified —</option>
              {JOB_FUNCTIONS.filter(f => 'group' in f).map((f: any) => (
                <optgroup key={f.group} label={f.group}>
                  {f.options.map((o: any) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Title (optional)</label>
            <input type="text" value={form.displayTitle}
              onChange={(e) => setForm({ ...form, displayTitle: e.target.value })}
              placeholder="e.g. Senior Software Developer, Lead Business Analyst"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <p className="text-xs text-gray-500 mt-1">Formatted title shown in UI and on documents</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title / Legacy Role</label>
            <input type="text" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="e.g. Senior Editor, Freelance Designer (optional — defaults to 'Staff Member')"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours/Month</label>
              <input type="number" min={0} max={744} value={form.maxHoursPerMonth}
                onChange={(e) => setForm({ ...form, maxHoursPerMonth: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-500">Default 160h. Staff manage their own pace within the monthly cap.</p>
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
          <h3 className="text-sm font-semibold text-gray-900">System Account</h3>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked System User</label>
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
          )}

          {!isEdit && form.isInternal && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
              <strong>Auto-account creation:</strong> A system login will be created automatically using the email above.
              The staff member will receive a welcome email with a link to set their password.
            </div>
          )}

          {!isEdit && !form.isInternal && (
            <p className="text-sm text-gray-500">
              External contractors access their tasks via magic link — no system account is needed.
            </p>
          )}
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
