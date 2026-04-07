import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { ActionMenu } from '../../components/ActionMenu';

interface TeamMember {
  id: string;
  staffMemberId: string;
  role: string;
  totalAllocatedHours: string;
  totalLoggedHours: string;
  isActive: boolean;
  staffMember?: { id: string; name: string; email: string; role: string; hourlyRate: string } | null;
}

interface StaffOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  number: string;
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  REMOVED: 'bg-gray-100 text-gray-600',
};

export function ProjectTeam() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ staffMemberId: '', role: '', allocatedHours: 0 });
  const [assignError, setAssignError] = useState('');
  const [sendLinkModal, setSendLinkModal] = useState<{ staffMemberId: string; staffName: string } | null>(null);
  const [sendLinkResult, setSendLinkResult] = useState<string | null>(null);

  const { data: projectData } = useQuery({
    queryKey: ['budgeting-project', projectId],
    queryFn: () => api<{ data: Project }>(`/budgeting/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['pm-project-team', projectId],
    queryFn: () => api<{ data: TeamMember[] }>(`/project-management/projects/${projectId}/team`),
    enabled: !!projectId,
  });

  const { data: staffData } = useQuery({
    queryKey: ['pm-staff-all'],
    queryFn: () => api<{ data: StaffOption[] }>('/project-management/staff?limit=500&status=ACTIVE'),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api(`/project-management/projects/${projectId}/team`, {
        method: 'POST',
        body: JSON.stringify({
          staffMemberId: assignForm.staffMemberId,
          role: assignForm.role || null,
          totalAllocatedHours: Number(assignForm.allocatedHours) || 0,
        }),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-project-team', projectId] });
      setShowAssignModal(false);
      setAssignForm({ staffMemberId: '', role: '', allocatedHours: 0 });
      setAssignError('');
    },
    onError: (err: Error) => setAssignError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api(`/project-management/assignments/${memberId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-project-team', projectId] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const sendAccessLinkMutation = useMutation({
    mutationFn: (staffMemberId: string) =>
      api(`/project-management/projects/${projectId}/staff/${staffMemberId}/send-access-link`, { method: 'POST' }),
    onSuccess: (data: any) => {
      setSendLinkModal(null);
      setSendLinkResult(`Access link sent to ${data?.data?.email || 'contractor'}`);
      setTimeout(() => setSendLinkResult(null), 5000);
    },
    onError: (err: Error) => {
      setSendLinkModal(null);
      setSendLinkResult(`Failed: ${err.message}`);
      setTimeout(() => setSendLinkResult(null), 5000);
    },
  });

  const projectName = projectData?.data ? `${projectData.data.number} — ${projectData.data.name}` : 'Project';

  return (
    <div>
      <PageHeader
        title={`Team: ${projectName}`}
        subtitle="Manage team assignments for this project"
        backTo={{ label: 'Projects', href: '/pm/projects' }}
        action={
          <button
            onClick={() => setShowAssignModal(true)}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Assign Staff
          </button>
        }
      />

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Member</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated Hours</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Logged Hours</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Utilization %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {teamData?.data?.map((m) => {
              const staffName = m.staffMember?.name || '—';
              const staffEmail = m.staffMember?.email || '';
              const allocated = Number(m.totalAllocatedHours || 0);
              const logged = Number(m.totalLoggedHours || 0);
              const utilization = allocated > 0 ? (logged / allocated) * 100 : 0;
              const utilizationColor = utilization > 100 ? 'text-red-600' : utilization >= 80 ? 'text-yellow-600' : 'text-green-700';
              const status = m.isActive ? 'ACTIVE' : 'INACTIVE';
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900">{staffName}</div>
                    <div className="text-xs text-gray-400">{staffEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.role}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{allocated}h</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{logged}h</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${utilizationColor}`}>
                    {utilization.toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <ActionMenu items={[
                      {
                        label: 'View Profile',
                        onClick: () => navigate(`/pm/staff/${m.staffMemberId}`),
                      },
                      {
                        label: 'View Tasks',
                        onClick: () => navigate(`/pm/projects/${projectId}/tasks`),
                      },
                      {
                        label: 'Create SOW',
                        onClick: () => navigate(`/pm/staff/${m.staffMemberId}/sow?projectId=${projectId}`),
                      },
                      {
                        label: 'Send Access Link',
                        onClick: () => setSendLinkModal({ staffMemberId: m.staffMemberId, staffName }),
                      },
                      {
                        label: 'Remove',
                        variant: 'danger',
                        onClick: () => removeMutation.mutate(m.id),
                      },
                    ]} />
                  </td>
                </tr>
              );
            })}
            {!isLoading && teamData?.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No team members assigned yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Success/Error Banner */}
      {sendLinkResult && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg shadow-lg px-5 py-3 text-sm font-medium ${sendLinkResult.startsWith('Failed') ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {sendLinkResult}
        </div>
      )}

      {/* Send Access Link Modal */}
      {sendLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Portal Access Link</h3>
            <p className="text-sm text-gray-600 mb-4">
              Send a portal access link to <strong>{sendLinkModal.staffName}</strong>? They will receive an email with a link to view their tasks and log working hours.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSendLinkModal(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => sendAccessLinkMutation.mutate(sendLinkModal.staffMemberId)}
                disabled={sendAccessLinkMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {sendAccessLinkMutation.isPending ? 'Sending...' : 'Send Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Staff to Project</h3>

            {assignError && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{assignError}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
                <select value={assignForm.staffMemberId}
                  onChange={(e) => {
                    const picked = staffData?.data?.find((s: any) => s.id === e.target.value);
                    setAssignForm({
                      ...assignForm,
                      staffMemberId: e.target.value,
                      // Auto-fill role from the staff member's default role if blank
                      role: assignForm.role || picked?.role || '',
                    });
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">-- Select staff member --</option>
                  {staffData?.data?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.role} ({s.availabilityType?.replace(/_/g, ' ')}, {s.maxHoursPerMonth}h/mo, R{Number(s.hourlyRate || 0).toFixed(0)}/hr)
                    </option>
                  ))}
                </select>
                {/* Show selected staff availability */}
                {assignForm.staffMemberId && (() => {
                  const selected = staffData?.data?.find((s: any) => s.id === assignForm.staffMemberId) as any;
                  if (!selected) return null;
                  const skills = Array.isArray(selected.skills) ? selected.skills : [];
                  return (
                    <div className="mt-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs">
                      <p className="font-medium text-blue-800 mb-1">{selected.name}</p>
                      <p className="text-blue-700">
                        {selected.availabilityType?.replace(/_/g, ' ')} &middot; {selected.maxHoursPerMonth}h/month &middot; R{Number(selected.hourlyRate || 0).toFixed(2)}/hr
                      </p>
                      {skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {skills.map((sk: string) => (
                            <span key={sk} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">{sk.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role on Project *</label>
                <input type="text" value={assignForm.role}
                  onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value })}
                  placeholder="e.g. Lead Editor, Cover Designer"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Hours</label>
                <input type="number" min={0} step={0.5} value={assignForm.allocatedHours}
                  onChange={(e) => setAssignForm({ ...assignForm, allocatedHours: Number(e.target.value) })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => { setShowAssignModal(false); setAssignError(''); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!assignForm.staffMemberId) {
                    setAssignError('Staff member is required.');
                    return;
                  }
                  assignMutation.mutate();
                }}
                disabled={assignMutation.isPending}
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
