import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

type Status   = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CLIENT' | 'RESOLVED' | 'CLOSED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Category = 'BUG' | 'FEATURE_REQUEST' | 'QUESTION' | 'CHANGE_REQUEST' | 'INCIDENT' | 'OTHER';

interface Ticket {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  slaResponseDue: string | null;
  slaResolutionDue: string | null;
  firstRespondedAt: string | null;
  slaBreached: boolean;
  reportedBy: string;
  assignedToStaff: string | null;
  assignee: { id: string; name: string } | null;
  tags: string[];
  resolutionNotes: string | null;
  slaOverdue: boolean;
  slaResponseOverdue: boolean;
  createdAt: string;
}

interface Comment {
  id: string;
  body: string;
  authorId: string;
  isInternal: boolean;
  isEdited: boolean;
  createdAt: string;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  LOW:      'bg-gray-100 text-gray-700',
  MEDIUM:   'bg-blue-100 text-blue-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const STATUS_STYLES: Record<Status, string> = {
  OPEN:           'bg-red-100 text-red-800',
  IN_PROGRESS:    'bg-blue-100 text-blue-800',
  PENDING_CLIENT: 'bg-amber-100 text-amber-800',
  RESOLVED:       'bg-green-100 text-green-800',
  CLOSED:         'bg-gray-100 text-gray-600',
};

function fmtRelative(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SLABadge({ ticket }: { ticket: Ticket }) {
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return null;
  if (ticket.slaBreached || ticket.slaOverdue) {
    return <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded">SLA BREACHED</span>;
  }
  if (ticket.slaResponseOverdue) {
    return <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">RESPONSE DUE</span>;
  }
  if (ticket.slaResolutionDue) {
    const hrs = (new Date(ticket.slaResolutionDue).getTime() - Date.now()) / 3_600_000;
    if (hrs < 4 && hrs > 0) {
      return <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{hrs.toFixed(0)}h left</span>;
    }
  }
  return null;
}

function TicketDetail({ ticket, projectId, staff, onClose }: {
  ticket: Ticket; projectId: string; staff: any[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data: detailData } = useQuery({
    queryKey: ['bil-ticket-detail', ticket.id],
    queryFn:  () => api<{ data: Ticket & { comments: Comment[] } }>(`/billetterie/projects/${projectId}/tickets/${ticket.id}`),
  });

  const detail = detailData?.data ?? ticket;
  const comments: Comment[] = (detail as any).comments ?? [];

  const updateMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/tickets/${ticket.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-tickets', projectId] }); qc.invalidateQueries({ queryKey: ['bil-ticket-detail', ticket.id] }); },
  });

  const commentMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/tickets/${ticket.id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-ticket-detail', ticket.id] }); setComment(''); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-500">#{ticket.ticketNumber}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[ticket.priority]}`}>{ticket.priority}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[ticket.status]}`}>{ticket.status.replace('_', ' ')}</span>
              <SLABadge ticket={ticket} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mt-1">{ticket.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-0">
            {/* Main content */}
            <div className="flex-1 px-6 py-4 space-y-4 border-r border-gray-100">
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Description</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </div>

              {ticket.resolutionNotes && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-green-700 uppercase mb-1">Resolution Notes</div>
                  <p className="text-sm text-green-800">{ticket.resolutionNotes}</p>
                </div>
              )}

              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Comments ({comments.length})</div>
                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className={`rounded-lg p-3 text-sm ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-xs text-gray-700">{c.authorId}</span>
                        {c.isInternal && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold">INTERNAL</span>}
                        {c.isEdited && <span className="text-[9px] text-gray-400">(edited)</span>}
                        <span className="ml-auto text-[10px] text-gray-400">{fmtRelative(c.createdAt)}</span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment form */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <textarea
                  value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Add a comment…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" />
                    <span className="text-amber-700">Internal note</span>
                  </label>
                  <button onClick={() => commentMut.mutate({ body: comment, isInternal })}
                    disabled={!comment.trim() || commentMut.isPending}
                    className="ml-auto px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {commentMut.isPending ? 'Posting…' : 'Post Comment'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-56 flex-shrink-0 px-4 py-4 space-y-4">
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Status</div>
                <select value={ticket.status}
                  onChange={e => updateMut.mutate({ status: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {(['OPEN', 'IN_PROGRESS', 'PENDING_CLIENT', 'RESOLVED', 'CLOSED'] as Status[]).map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Priority</div>
                <select value={ticket.priority}
                  onChange={e => updateMut.mutate({ priority: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Assignee</div>
                <select value={ticket.assignedToStaff ?? ''}
                  onChange={e => updateMut.mutate({ assignedToStaff: e.target.value || null })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {ticket.slaResolutionDue && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Resolution SLA</div>
                  <div className={`text-xs font-medium ${ticket.slaOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                    {new Date(ticket.slaResolutionDue).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {ticket.slaOverdue && <span className="ml-1 text-red-600 font-bold">BREACHED</span>}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Category</div>
                <div className="text-xs text-gray-700">{ticket.category.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Opened</div>
                <div className="text-xs text-gray-700">{fmtRelative(ticket.createdAt)}</div>
              </div>
              {ticket.tags.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map(t => <span key={t} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props { projectId: string }

export function BilletterieSupport({ projectId }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('open');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: 'OTHER' as Category, priority: 'MEDIUM' as Priority, tags: '' });

  const statusQuery = statusFilter === 'open' ? 'OPEN,IN_PROGRESS,PENDING_CLIENT' : statusFilter === 'closed' ? 'RESOLVED,CLOSED' : '';

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['bil-tickets', projectId, statusFilter, priorityFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search) params.set('search', search);
      // Multiple status filtering done client-side for simplicity
      return api<{ data: Ticket[]; pagination: any }>(`/billetterie/projects/${projectId}/tickets?${params}`);
    },
  });

  const { data: slaData } = useQuery({
    queryKey: ['bil-sla-dashboard', projectId],
    queryFn: () => api<{ data: any[]; summary: any }>(`/billetterie/projects/${projectId}/sla-dashboard`),
  });

  const { data: teamData } = useQuery({
    queryKey: ['bil-team-staff', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/team`),
  });

  const staff = (teamData?.data ?? []).map((m: any) => ({
    id: m.staffMemberId ?? m.id, name: m.name, role: m.memberRole ?? m.role,
  })).filter((m: any) => m.name);

  const createMut = useMutation({
    mutationFn: (body: any) => api(`/billetterie/projects/${projectId}/tickets`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bil-tickets', projectId] });
      qc.invalidateQueries({ queryKey: ['bil-sla-dashboard', projectId] });
      setCreating(false);
      setForm({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tags: '' });
    },
  });

  const allTickets: Ticket[] = ticketsData?.data ?? [];
  const filteredTickets = statusFilter === 'all' ? allTickets
    : statusFilter === 'open' ? allTickets.filter(t => ['OPEN', 'IN_PROGRESS', 'PENDING_CLIENT'].includes(t.status))
    : allTickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));

  const sla = slaData?.summary ?? { breached: 0, atRisk: 0, healthy: 0, total: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Support Desk</h2>
          <p className="text-xs text-gray-500 mt-0.5">Track support requests and incidents with SLA monitoring</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + New Ticket
        </button>
      </div>

      {/* SLA summary strip */}
      {sla.total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-red-700">{sla.breached}</div>
            <div className="text-[9px] font-bold text-red-500 uppercase mt-0.5">SLA Breached</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-amber-700">{sla.atRisk}</div>
            <div className="text-[9px] font-bold text-amber-500 uppercase mt-0.5">At Risk (&lt;4h)</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-green-700">{sla.healthy}</div>
            <div className="text-[9px] font-bold text-green-500 uppercase mt-0.5">On Track</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-gray-700">{sla.total}</div>
            <div className="text-[9px] font-bold text-gray-500 uppercase mt-0.5">Open Tickets</div>
          </div>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">New Support Ticket</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Brief description of the issue…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                placeholder="Steps to reproduce, expected vs actual behaviour, screenshots…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {(['BUG', 'FEATURE_REQUEST', 'QUESTION', 'CHANGE_REQUEST', 'INCIDENT', 'OTHER'] as Category[]).map(c => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. login, data-export, urgent"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate({
              title: form.title, description: form.description, category: form.category, priority: form.priority,
              tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            })} disabled={!form.title.trim() || !form.description.trim() || createMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMut.isPending ? 'Submitting…' : 'Submit Ticket'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[['open', 'Open'], ['closed', 'Resolved/Closed'], ['all', 'All']].map(([v, l]) => (
            <button key={v} onClick={() => { setStatusFilter(v); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">All priorities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tickets…"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1 min-w-40" />
      </div>

      {/* Ticket list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading tickets…</div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-3xl mb-2">🎟</div>
          <p className="text-sm font-medium text-gray-500">No tickets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map(t => (
            <div key={t.id} onClick={() => setSelected(t)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-gray-400">#{t.ticketNumber}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[t.priority]}`}>{t.priority}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[t.status]}`}>{t.status.replace('_', ' ')}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t.category.replace('_', ' ')}</span>
                    <SLABadge ticket={t} />
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                    {t.assignee && <span>Assigned: <span className="text-gray-600">{t.assignee.name}</span></span>}
                    {t.slaResolutionDue && !t.slaOverdue && (
                      <span>SLA: {new Date(t.slaResolutionDue).toLocaleDateString('en-ZA')}</span>
                    )}
                    <span className="ml-auto">{fmtRelative(t.createdAt)}</span>
                  </div>
                </div>
                <span className="text-gray-300 group-hover:text-blue-400 text-sm flex-shrink-0">›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLA Policy config */}
      <SLAPoliciesPanel projectId={projectId} />

      {selected && (
        <TicketDetail ticket={selected} projectId={projectId} staff={staff} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SLAPoliciesPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ responseHours: 8, resolutionHours: 48, isBusinessHours: true });
  const qc = useQueryClient();

  const { data: policyData } = useQuery({
    queryKey: ['bil-sla-policies', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/sla-policies`),
    enabled: open,
  });

  const updateMut = useMutation({
    mutationFn: ({ priority, body }: { priority: string; body: any }) =>
      api(`/billetterie/projects/${projectId}/sla-policies/${priority}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bil-sla-policies', projectId] }); setEditing(null); },
  });

  const policies: any[] = policyData?.data ?? [];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">SLA Policies</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">Configure SLA response and resolution times per priority. Overrides the global defaults.</p>
          <div className="space-y-2">
            {policies.map((p: any) => (
              <div key={p.priority} className="border border-gray-200 rounded-lg p-3">
                {editing === p.priority ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-700">{p.priority}</span>
                      {p.isOverride && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Project Override</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-500 block mb-0.5">Response (hrs)</label>
                        <input type="number" min={1} value={editForm.responseHours}
                          onChange={e => setEditForm(f => ({ ...f, responseHours: Number(e.target.value) }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-500 block mb-0.5">Resolution (hrs)</label>
                        <input type="number" min={1} value={editForm.resolutionHours}
                          onChange={e => setEditForm(f => ({ ...f, resolutionHours: Number(e.target.value) }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      </div>
                      <div className="flex items-end pb-0.5">
                        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                          <input type="checkbox" checked={editForm.isBusinessHours}
                            onChange={e => setEditForm(f => ({ ...f, isBusinessHours: e.target.checked }))} />
                          Biz hours
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => updateMut.mutate({ priority: p.priority, body: editForm })} disabled={updateMut.isPending}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => setEditing(null)} className="px-2 py-1 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-16 ${
                      p.priority === 'CRITICAL' ? 'text-red-700' : p.priority === 'HIGH' ? 'text-orange-700' :
                      p.priority === 'MEDIUM' ? 'text-blue-700' : 'text-gray-600'
                    }`}>{p.priority}</span>
                    <span className="text-xs text-gray-600 flex-1">
                      Response: <strong>{p.responseHours}h</strong> · Resolution: <strong>{p.resolutionHours}h</strong>
                      {p.isBusinessHours && <span className="text-gray-400"> (biz hrs)</span>}
                    </span>
                    {p.isOverride && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Override</span>}
                    <button onClick={() => { setEditing(p.priority); setEditForm({ responseHours: p.responseHours, resolutionHours: p.resolutionHours, isBusinessHours: p.isBusinessHours }); }}
                      className="text-xs text-blue-600 hover:underline">Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
