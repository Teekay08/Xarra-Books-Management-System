import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import {
  ISSUE_TYPE_ICON, ISSUE_STATUS_BADGE, SEVERITY_BADGE,
  formatRelativeTime, getInitials,
} from '../billetterie-constants';

interface Props {
  projectId: string;
}

const TYPE_OPTIONS = ['', 'BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK'];

export function BilletterieIssueList({ projectId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showNewForm, setShowNewForm] = useState(false);

  // New issue form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('BUG');
  const [newSeverity, setNewSeverity] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ tab, page: String(page), limit: '30' });
  if (search)     params.set('search', search);
  if (typeFilter) params.set('type', typeFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['bil-issues', projectId, tab, search, typeFilter, page],
    queryFn: () => api<{ data: any[]; meta: any; pagination: any }>(`/billetterie/projects/${projectId}/issues?${params}`),
    keepPreviousData: true,
  } as any);

  const issues     = (data as any)?.data ?? [];
  const meta       = (data as any)?.meta ?? {};
  const pagination = (data as any)?.pagination ?? {};

  async function createIssue() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api(`/billetterie/projects/${projectId}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle, type: newType,
          severity: newSeverity || null,
          body: newBody || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['bil-issues', projectId] });
      setShowNewForm(false);
      setNewTitle(''); setNewType('BUG'); setNewSeverity(''); setNewBody('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search issues..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          {TYPE_OPTIONS.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setShowNewForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
          + New Issue
        </button>
      </div>

      {/* Open/Closed tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200 pb-0">
        <button
          onClick={() => { setTab('open'); setPage(1); }}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'open' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          ○ Open ({meta.openCount ?? 0})
        </button>
        <button
          onClick={() => { setTab('closed'); setPage(1); }}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'closed' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          ✓ Closed ({meta.closedCount ?? 0})
        </button>
      </div>

      {/* New issue form */}
      {showNewForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <h4 className="text-sm font-semibold text-gray-900">New Issue</h4>
          <input
            type="text" placeholder="Issue title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK'].map((t) => <option key={t} value={t}>{ISSUE_TYPE_ICON[t]} {t}</option>)}
            </select>
            <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Severity (optional)</option>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Description (optional, markdown supported)"
            value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={createIssue} disabled={!newTitle.trim() || creating} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Issue'}
            </button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Issue list */}
      {isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading issues...</div>
      ) : issues.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">{tab === 'open' ? 'No open issues.' : 'No closed issues.'}</p>
          {tab === 'open' && <p className="text-xs mt-1">Click "New Issue" to file the first one.</p>}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {issues.map((issue: any) => (
            <div
              key={issue.id}
              onClick={() => navigate(`/billetterie/projects/${projectId}/issues/${issue.id}`)}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <span className="text-base mt-0.5 flex-shrink-0">{ISSUE_TYPE_ICON[issue.type] ?? '●'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 hover:text-blue-600">{issue.title}</span>
                  {(issue.labels ?? []).map((l: string) => (
                    <span key={l} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">{l}</span>
                  ))}
                  {issue.severity && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[issue.severity]}`}>{issue.severity}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  #{issue.issueNumber} · opened {formatRelativeTime(issue.createdAt)}
                  {issue.milestone && ` · ${issue.milestone.title}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ISSUE_STATUS_BADGE[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
                {(issue.assignees ?? []).length > 0 && (
                  <span className="h-6 w-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-semibold" title={`${issue.assignees.length} assignee(s)`}>
                    {issue.assignees.length}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-sm text-gray-500">{page} / {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}
