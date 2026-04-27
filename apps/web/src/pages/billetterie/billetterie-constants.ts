// Shared constants for Billetterie PM module

export const PHASES = [
  { key: 'INITIATION',   label: 'Initiation',   color: 'slate',  requiredDocs: ['Project Charter', 'Stakeholder Register', 'Kick-off Meeting Minutes'] },
  { key: 'ELICITATION',  label: 'Elicitation',  color: 'purple', requiredDocs: ['Business Requirements Document', 'User Stories / Use Cases', 'Process Diagrams'] },
  { key: 'ARCHITECTURE', label: 'Architecture', color: 'indigo', requiredDocs: ['System Architecture Document', 'Tech Stack Proposal', 'Architecture Review Sign-off'] },
  { key: 'DEVELOPMENT',  label: 'Development',  color: 'blue',   requiredDocs: ['Development Plan', 'Sprint Reports'] },
  { key: 'TESTING',      label: 'Testing',      color: 'yellow', requiredDocs: ['Test Plan', 'UAT Sign-off', 'Bug Register (closed)'] },
  { key: 'SIGN_OFF',     label: 'Sign-off',     color: 'orange', requiredDocs: ['Client Acceptance Certificate', 'Handover Document', 'Final Invoice'] },
  { key: 'CLOSURE',      label: 'Closure',      color: 'green',  requiredDocs: ['Project Closure Report', 'Lessons Learned Document'] },
] as const;

export type PhaseKey = typeof PHASES[number]['key'];

export const PHASE_ORDER: PhaseKey[] = PHASES.map((p) => p.key);
export const PHASE_IDX = Object.fromEntries(PHASES.map((p, i) => [p.key, i])) as Record<PhaseKey, number>;
export const PHASE_BY_KEY = Object.fromEntries(PHASES.map((p) => [p.key, p])) as Record<PhaseKey, typeof PHASES[number]>;

export const CLR: Record<string, Record<string, string>> = {
  slate:  { dot: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-200', text: 'text-slate-700',  btn: 'bg-slate-600 hover:bg-slate-700' },
  purple: { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700',bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700' },
  indigo: { dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700',bg: 'bg-indigo-50', border: 'border-indigo-200',text: 'text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  blue:   { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',    bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   btn: 'bg-blue-600 hover:bg-blue-700' },
  yellow: { dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700',bg: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700', btn: 'bg-yellow-600 hover:bg-yellow-700' },
  orange: { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700',bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-700', btn: 'bg-orange-600 hover:bg-orange-700' },
  green:  { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  btn: 'bg-green-600 hover:bg-green-700' },
};

export const PROJECT_STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const TASK_STATUS_BADGE: Record<string, string> = {
  TODO:        'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  REVIEW:      'bg-purple-100 text-purple-700',
  DONE:        'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-600',
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

export const PRIORITY_BADGE: Record<string, string> = {
  LOW:    'bg-gray-100 text-gray-500',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH:   'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-gray-400', MEDIUM: 'bg-blue-500', HIGH: 'bg-orange-500', URGENT: 'bg-red-600',
};

export const SEVERITY_BADGE: Record<string, string> = {
  LOW:      'bg-gray-100 text-gray-500',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export const ISSUE_STATUS_BADGE: Record<string, string> = {
  OPEN:        'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED:    'bg-purple-100 text-purple-700',
  CLOSED:      'bg-gray-100 text-gray-600',
  WONT_FIX:    'bg-gray-100 text-gray-400',
};

export const ISSUE_TYPE_ICON: Record<string, string> = {
  BUG:         '🐛',
  FEATURE:     '✨',
  IMPROVEMENT: '⚡',
  QUESTION:    '❓',
  TASK:        '✅',
};

export const MILESTONE_STATUS_BADGE: Record<string, string> = {
  PENDING:  'bg-gray-100 text-gray-600',
  MET:      'bg-green-100 text-green-700',
  MISSED:   'bg-red-100 text-red-700',
  DEFERRED: 'bg-yellow-100 text-yellow-700',
};

export const TEAM_ROLE_BADGE: Record<string, string> = {
  SPONSOR: 'bg-purple-100 text-purple-700',
  PM:      'bg-blue-100 text-blue-700',
  BA:      'bg-teal-100 text-teal-700',
  ADMIN:   'bg-gray-100 text-gray-600',
};

export const TEAM_ROLE_LABEL: Record<string, string> = {
  SPONSOR: 'Project Sponsor',
  PM:      'Project Manager',
  BA:      'Business Analyst',
  ADMIN:   'Project Admin',
};

export const TIME_LOG_STATUS_BADGE: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-500',
  SUBMITTED: 'bg-yellow-100 text-yellow-700',
  APPROVED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
};

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}
