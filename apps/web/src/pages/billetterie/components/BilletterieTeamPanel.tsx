import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { TEAM_ROLE_BADGE, TEAM_ROLE_LABEL, getInitials } from '../billetterie-constants';

interface Props {
  projectId: string;
}

const ROLES = ['SPONSOR', 'PM', 'BA', 'ADMIN'] as const;

export function BilletterieTeamPanel({ projectId }: Props) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newRole, setNewRole] = useState<string>('BA');
  const [adding, setAdding] = useState(false);

  const { data: teamData } = useQuery({
    queryKey: ['bil-team', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });

  const { data: allStaff } = useQuery({
    queryKey: ['bil-staff-all'],
    queryFn: () => api<{ data: any[] }>('/billetterie/team'),
  });

  const members = teamData?.data ?? [];
  const staff   = allStaff?.data ?? [];
  const memberIds = new Set(members.map((m: any) => m.staffMemberId));
  const available = staff.filter((s: any) => !memberIds.has(s.id));

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api(`/billetterie/projects/${projectId}/team/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-team', projectId] }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      api(`/billetterie/projects/${projectId}/team/${memberId}`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bil-team', projectId] }),
  });

  async function addMember() {
    if (!newMemberId) return;
    setAdding(true);
    try {
      await api(`/billetterie/projects/${projectId}/team`, {
        method: 'POST',
        body: JSON.stringify({ staffMemberId: newMemberId, role: newRole }),
      });
      queryClient.invalidateQueries({ queryKey: ['bil-team', projectId] });
      setShowAdd(false);
      setNewMemberId('');
    } finally {
      setAdding(false);
    }
  }

  // Group by role
  const grouped: Record<string, any[]> = {};
  for (const m of members) {
    if (!grouped[m.role]) grouped[m.role] = [];
    grouped[m.role].push(m);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Project Team</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
          + Add Member
        </button>
      </div>

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Team Member</h4>
          <select
            value={newMemberId}
            onChange={(e) => {
              setNewMemberId(e.target.value);
              // Auto-set suggested role based on job function
              const selected = available.find((s: any) => s.id === e.target.value);
              if (selected?.suggestedBilRole) setNewRole(selected.suggestedBilRole);
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select staff member...</option>
            {available.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.displayTitle || s.role}
                {s.suggestedBilRole ? ` (suggests: ${s.suggestedBilRole})` : ''}
              </option>
            ))}
          </select>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Project Role</label>
              {newMemberId && available.find((s: any) => s.id === newMemberId)?.suggestedBilRole && (
                <span className="text-[10px] text-blue-600">
                  Suggested: {available.find((s: any) => s.id === newMemberId)?.suggestedBilRole} based on job function
                </span>
              )}
            </div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{TEAM_ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={addMember} disabled={!newMemberId || adding} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {adding ? 'Adding...' : 'Add to Team'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {ROLES.map((role) => {
        const roleMembers = grouped[role] ?? [];
        if (roleMembers.length === 0) return null;
        return (
          <div key={role}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{TEAM_ROLE_LABEL[role]}</p>
            <div className="space-y-2">
              {roleMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(m.name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEAM_ROLE_BADGE[m.role]}`}>{m.role}</span>
                  <select
                    value={m.role}
                    onChange={(e) => roleMutation.mutate({ memberId: m.id, role: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => { if (confirm(`Remove ${m.name} from team?`)) removeMutation.mutate(m.id); }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {members.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-4">No team members yet. Click "Add Member" to get started.</p>
      )}
    </div>
  );
}
