import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import {
  ISSUE_TYPE_ICON, ISSUE_STATUS_BADGE, SEVERITY_BADGE,
  formatRelativeTime, getInitials,
} from './billetterie-constants';

marked.setOptions({ breaks: true });

function MarkdownBody({ body }: { body: string }) {
  const html = DOMPurify.sanitize(marked.parse(body) as string);
  return (
    <div
      className="prose prose-sm max-w-none text-gray-700"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX'] as const;
const SEVERITIES = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const ISSUE_TYPES = ['BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION', 'TASK'] as const;

export default function BilletterieIssueDetail() {
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Body/title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Comment form
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Comment edit
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  const titleRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bil-issue', projectId, issueId],
    queryFn: () => api<{ data: any }>(`/billetterie/projects/${projectId}/issues/${issueId}`),
  });

  const { data: staffData } = useQuery({
    queryKey: ['bil-staff-all'],
    queryFn: () => api<{ data: any[] }>('/billetterie/team'),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['bil-milestones', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/milestones`),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['bil-tasks', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/tasks`),
  });

  const issue     = data?.data;
  const staff     = staffData?.data ?? [];
  const milestones = milestonesData?.data ?? [];
  const tasks     = tasksData?.data ?? [];

  useEffect(() => {
    if (issue) { setTitleDraft(issue.title); setBodyDraft(issue.body ?? ''); }
  }, [issue]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  async function patchIssue(patch: Record<string, any>) {
    setSavingMeta(true);
    try {
      await api(`/billetterie/projects/${projectId}/issues/${issueId}`, {
        method: 'PUT', body: JSON.stringify(patch),
      });
      queryClient.invalidateQueries({ queryKey: ['bil-issue', projectId, issueId] });
      queryClient.invalidateQueries({ queryKey: ['bil-issues', projectId] });
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveTitle() {
    if (!titleDraft.trim()) return;
    await patchIssue({ title: titleDraft.trim() });
    setEditingTitle(false);
  }

  async function saveBody() {
    await patchIssue({ body: bodyDraft });
    setEditingBody(false);
  }

  async function submitComment() {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await api(`/billetterie/projects/${projectId}/issues/${issueId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: commentBody }),
      });
      queryClient.invalidateQueries({ queryKey: ['bil-issue', projectId, issueId] });
      setCommentBody('');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function saveCommentEdit(commentId: string) {
    await api(`/billetterie/projects/${projectId}/issues/${issueId}/comments/${commentId}`, {
      method: 'PUT', body: JSON.stringify({ body: commentDraft }),
    });
    queryClient.invalidateQueries({ queryKey: ['bil-issue', projectId, issueId] });
    setEditingCommentId(null);
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return;
    await api(`/billetterie/projects/${projectId}/issues/${issueId}/comments/${commentId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['bil-issue', projectId, issueId] });
  }

  function toggleAssignee(staffId: string) {
    const cur: string[] = issue?.assignees ?? [];
    const next = cur.includes(staffId) ? cur.filter((x: string) => x !== staffId) : [...cur, staffId];
    patchIssue({ assignees: next });
  }

  if (isLoading) return <div className="p-8 text-sm text-gray-500">Loading issue...</div>;
  if (!issue) return <div className="p-8 text-sm text-gray-500">Issue not found.</div>;

  const comments: any[] = issue.comments ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <PageHeader
        title={`#${issue.issueNumber} — ${issue.title}`}
        backTo={{ label: issue.projectName ?? 'Project', href: `/billetterie/projects/${projectId}?view=issues` }}
      />

      <div className="flex gap-6 mt-4">
        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Title */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {editingTitle ? (
              <div className="flex gap-2">
                <input
                  ref={titleRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={saveTitle} disabled={savingMeta} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">Save</button>
                <button onClick={() => setEditingTitle(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-start gap-2 group">
                <h1 className="text-xl font-bold text-gray-900 flex-1">{issue.title}</h1>
                <button onClick={() => setEditingTitle(true)} className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-600 transition-opacity px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0">
                  Edit
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-base">{ISSUE_TYPE_ICON[issue.type] ?? '●'}</span>
              <span className="text-sm text-gray-500">{issue.type}</span>
              {issue.severity && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[issue.severity]}`}>{issue.severity}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ISSUE_STATUS_BADGE[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
              {(issue.labels ?? []).map((l: string) => (
                <span key={l} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{l}</span>
              ))}
              <span className="text-xs text-gray-400 ml-auto">
                Opened {formatRelativeTime(issue.createdAt)} by {issue.reporterEmail ?? 'unknown'}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Description</h3>
              {!editingBody && (
                <button onClick={() => setEditingBody(true)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">Edit</button>
              )}
            </div>
            {editingBody ? (
              <div className="space-y-3">
                <textarea
                  value={bodyDraft}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  rows={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y"
                  placeholder="Markdown supported..."
                />
                <div className="flex gap-2">
                  <button onClick={saveBody} disabled={savingMeta} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">Save</button>
                  <button onClick={() => { setEditingBody(false); setBodyDraft(issue.body ?? ''); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            ) : issue.body ? (
              <MarkdownBody body={issue.body} />
            ) : (
              <p className="text-sm text-gray-400 italic">No description. Click Edit to add one.</p>
            )}
          </div>

          {/* Comments */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
            <h3 className="text-sm font-semibold text-gray-900">{comments.length} Comment{comments.length !== 1 ? 's' : ''}</h3>

            {comments.map((c: any) => (
              <div key={c.id} className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                  {getInitials(c.authorEmail ?? '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">{c.authorEmail}</span>
                    <span className="text-xs text-gray-400">{formatRelativeTime(c.createdAt)}</span>
                    {c.isEdited && <span className="text-xs text-gray-400">(edited)</span>}
                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={() => { setEditingCommentId(c.id); setCommentDraft(c.body); }}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
                      >Edit</button>
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
                      >Delete</button>
                    </div>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="space-y-2 mt-2">
                      <textarea
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveCommentEdit(c.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs">Save</button>
                        <button onClick={() => setEditingCommentId(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 bg-gray-50 rounded-lg p-3">
                      <MarkdownBody body={c.body} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* New comment */}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">ME</div>
              <div className="flex-1 space-y-2">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  placeholder="Leave a comment (markdown supported)..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
                <button
                  onClick={submitComment}
                  disabled={!commentBody.trim() || submittingComment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingComment ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="w-64 flex-shrink-0 space-y-4">
          {/* Status */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
            <select
              value={issue.status}
              onChange={(e) => patchIssue({ status: e.target.value })}
              disabled={savingMeta}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>

          {/* Type */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</p>
            <select
              value={issue.type}
              onChange={(e) => patchIssue({ type: e.target.value })}
              disabled={savingMeta}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {ISSUE_TYPES.map((t) => <option key={t} value={t}>{ISSUE_TYPE_ICON[t]} {t}</option>)}
            </select>
          </div>

          {/* Severity */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</p>
            <select
              value={issue.severity ?? ''}
              onChange={(e) => patchIssue({ severity: e.target.value || null })}
              disabled={savingMeta}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {SEVERITIES.map((s) => <option key={s} value={s}>{s || '— None —'}</option>)}
            </select>
          </div>

          {/* Assignees */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignees</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {staff.map((s: any) => {
                const assigned = (issue.assignees ?? []).includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer py-0.5 rounded hover:bg-gray-50 px-1">
                    <input
                      type="checkbox"
                      checked={assigned}
                      onChange={() => toggleAssignee(s.id)}
                      className="rounded border-gray-300"
                    />
                    <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                      {getInitials(s.name)}
                    </div>
                    <span className="text-xs text-gray-700 truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Milestone */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Milestone</p>
            <select
              value={issue.milestoneId ?? ''}
              onChange={(e) => patchIssue({ milestoneId: e.target.value || null })}
              disabled={savingMeta}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— None —</option>
              {milestones.map((m: any) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>

          {/* Linked task */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Task</p>
            <select
              value={issue.linkedTaskId ?? ''}
              onChange={(e) => patchIssue({ linkedTaskId: e.target.value || null })}
              disabled={savingMeta}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— None —</option>
              {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          {/* Metadata */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1 text-xs text-gray-500">
            <p>Reporter: {issue.reporterEmail ?? '—'}</p>
            <p>Created: {new Date(issue.createdAt).toLocaleDateString('en-ZA')}</p>
            {issue.closedAt && <p>Closed: {new Date(issue.closedAt).toLocaleDateString('en-ZA')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
