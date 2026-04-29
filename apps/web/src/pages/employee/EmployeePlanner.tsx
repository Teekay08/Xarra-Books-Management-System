import { Link, useSearchParams } from 'react-router';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

type PlannerTask = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  projectName: string | null;
  projectNumber: string | null;
  dueDate: string | null;
  remainingHours: number;
  isOverdue: boolean;
  plannerEntryId?: string;
  plannedDate?: string;
  plannedHours?: number | null;
  plannedHoursPerDay?: number | null;
  spanStart?: string;
  spanEnd?: string;
  spanTotalDays?: number;
  spanDayIndex?: number;
  note?: string | null;
};

type WeekDay = {
  date: string;
  dayName: string;
  dayOfMonth: number;
  tasks: PlannerTask[];
};

type WeekPlannerResponse = {
  data: {
    weekStart: string;
    weekEnd: string;
    days: WeekDay[];
    unscheduled: PlannerTask[];
    totals: {
      scheduledTasks: number;
      uniqueTasks: number;
      unscheduledTasks: number;
      overdueTasks: number;
    };
  };
};

type MonthDay = {
  date: string;
  dayOfMonth: number;
  dayName: string;
  tasks: PlannerTask[];
};

type MonthPlannerResponse = {
  data: {
    year: number;
    month: number;
    monthStart: string;
    monthEnd: string;
    days: MonthDay[];
    unscheduled: PlannerTask[];
    totals: {
      scheduledTasks: number;
      uniqueTasks: number;
      unscheduledTasks: number;
      overdueTasks: number;
    };
  };
};

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmd(value: string | null): Date | null {
  if (!value) return null;
  const parts = value.split('-').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function EmployeePlanner() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<{ taskId: string; plannerEntryId?: string } | null>(null);
  const [resizing, setResizing] = useState<{
    entryId: string;
    edge: 'start' | 'end';
    spanStart: string;
    spanEnd: string;
  } | null>(null);
  const [editing, setEditing] = useState<{
    entryId: string;
    taskId: string;
    taskLabel: string;
    startDate: string;
    endDate: string;
    plannedHours: string;
    note: string;
    remainingHours: number;
  } | null>(null);
  const [planSpanModal, setPlanSpanModal] = useState<{
    taskId: string;
    taskLabel: string;
    startDate: string;
    endDate: string;
    plannedHours: string;
    note: string;
    remainingHours: number;
  } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [extensionModal, setExtensionModal] = useState<{
    taskId: string;
    taskLabel: string;
    requestedHours: string;
    reason: string;
  } | null>(null);
  const [logHoursModal, setLogHoursModal] = useState<{
    taskId: string;
    taskLabel: string;
    workDate: string;
    hours: string;
    description: string;
  } | null>(null);
  const [requestTaskModal, setRequestTaskModal] = useState<{
    projectId: string;
    projectLabel: string;
    linkedTaskId: string | null;
    title: string;
    description: string;
    justification: string;
    estimatedHours: string;
  } | null>(null);
  const mode = params.get('mode') === 'month' ? 'month' : 'week';

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2400);
  };

  const weekStartParam = params.get('start');
  const weekBase = parseYmd(weekStartParam) || startOfWeekMonday(new Date());
  const weekStart = startOfWeekMonday(weekBase);

  const monthParam = params.get('month');
  const monthBase = (() => {
    if (!monthParam) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    const [y, m] = monthParam.split('-').map((n) => Number(n));
    if (!y || !m) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    return { year: y, month: m };
  })();

  const weekQuery = useQuery({
    queryKey: ['my-planner-week', ymd(weekStart)],
    queryFn: () => api<WeekPlannerResponse>(`/project-management/my/planner/week?start=${ymd(weekStart)}`),
    enabled: mode === 'week',
  });

  const monthQuery = useQuery({
    queryKey: ['my-planner-month', monthBase.year, monthBase.month],
    queryFn: () => api<MonthPlannerResponse>(`/project-management/my/planner/month?year=${monthBase.year}&month=${monthBase.month}`),
    enabled: mode === 'month',
  });

  const activeTotals = mode === 'week' ? weekQuery.data?.data.totals : monthQuery.data?.data.totals;

  const invalidatePlannerQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-planner-week'] }),
      queryClient.invalidateQueries({ queryKey: ['my-planner-month'] }),
    ]);
  };

  const createPlannerEntry = useMutation({
    mutationFn: (payload: { taskAssignmentId: string; plannedDate: string; endDate?: string | null; plannedHours?: number | null; note?: string | null }) =>
      api('/project-management/my/planner/entry', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePlannerQueries();
      showToast('success', 'Task planned successfully.');
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to plan task.'),
  });

  const updatePlannerEntry = useMutation({
    mutationFn: (payload: { entryId: string; plannedDate?: string; endDate?: string | null; plannedHours?: number | null; note?: string | null }) =>
      api(`/project-management/my/planner/entry/${payload.entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plannedDate: payload.plannedDate,
          endDate: payload.endDate,
          plannedHours: payload.plannedHours,
          note: payload.note,
        }),
      }),
    onSuccess: async (_result, variables) => {
      await invalidatePlannerQueries();
      if (variables.plannedDate) {
        showToast('success', 'Task shifted to new date.');
      } else {
        showToast('success', 'Planner details updated.');
      }
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to update plan.'),
  });

  const requestExtension = useMutation({
    mutationFn: (payload: { taskId: string; requestedHours: number; reason: string }) =>
      api(`/project-management/tasks/${payload.taskId}/request-extension`, {
        method: 'POST',
        body: JSON.stringify({ requestedHours: payload.requestedHours, reason: payload.reason }),
      }),
    onSuccess: async () => {
      await invalidatePlannerQueries();
      showToast('success', 'Time extension requested. Your PM will review it.');
      setExtensionModal(null);
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to request extension.'),
  });

  const logHoursMutation = useMutation({
    mutationFn: (payload: { taskId: string; workDate: string; hours: number; description: string }) =>
      api(`/project-management/tasks/${payload.taskId}/log-time`, {
        method: 'POST',
        body: JSON.stringify({
          workDate: payload.workDate,
          hours: payload.hours,
          description: payload.description,
        }),
      }),
    onSuccess: async () => {
      await invalidatePlannerQueries();
      showToast('success', 'Hours logged. Awaiting PM approval.');
      setLogHoursModal(null);
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to log hours.'),
  });

  const submitLogHours = () => {
    if (!logHoursModal) return;
    const hours = Number(logHoursModal.hours);
    if (!hours || Number.isNaN(hours) || hours <= 0) {
      showToast('error', 'Enter a positive number of hours.');
      return;
    }
    if (!logHoursModal.workDate) {
      showToast('error', 'Pick a work date.');
      return;
    }
    if (!logHoursModal.description.trim()) {
      showToast('error', 'Add a short description of what you did.');
      return;
    }
    logHoursMutation.mutate({
      taskId: logHoursModal.taskId,
      workDate: logHoursModal.workDate,
      hours,
      description: logHoursModal.description.trim(),
    });
  };

  const requestTaskMutation = useMutation({
    mutationFn: (payload: {
      projectId: string;
      title: string;
      description: string;
      justification: string;
      estimatedHours: number;
      linkedTaskId: string | null;
    }) =>
      api('/project-management/task-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePlannerQueries();
      showToast('success', 'Task request sent. Your PM will review it.');
      setRequestTaskModal(null);
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to send task request.'),
  });

  const submitTaskRequest = () => {
    if (!requestTaskModal) return;
    const hours = Number(requestTaskModal.estimatedHours);
    if (!requestTaskModal.title.trim()) return showToast('error', 'Title is required.');
    if (!requestTaskModal.description.trim()) return showToast('error', 'Describe what you need to do.');
    if (!requestTaskModal.justification.trim()) return showToast('error', 'Explain why this task is needed.');
    if (!hours || Number.isNaN(hours) || hours <= 0) return showToast('error', 'Estimated hours must be positive.');

    requestTaskMutation.mutate({
      projectId: requestTaskModal.projectId,
      title: requestTaskModal.title.trim(),
      description: requestTaskModal.description.trim(),
      justification: requestTaskModal.justification.trim(),
      estimatedHours: hours,
      linkedTaskId: requestTaskModal.linkedTaskId,
    });
  };

  const openLogHoursModal = (task: PlannerTask, plannedDate?: string) => {
    setLogHoursModal({
      taskId: task.id,
      taskLabel: `${task.number} - ${task.title}`,
      workDate: plannedDate || ymd(new Date()),
      hours: '',
      description: '',
    });
  };

  const openRequestTaskModal = (task?: PlannerTask) => {
    if (task && task.projectId) {
      setRequestTaskModal({
        projectId: task.projectId,
        projectLabel: `${task.projectNumber || ''} ${task.projectName || ''}`.trim(),
        linkedTaskId: task.id,
        title: '',
        description: '',
        justification: '',
        estimatedHours: '',
      });
      return;
    }
    // No task context — pick from any task in current view
    const allTasks = [
      ...(weekQuery.data?.data.days.flatMap((d) => d.tasks) || []),
      ...(weekQuery.data?.data.unscheduled || []),
      ...(monthQuery.data?.data.days.flatMap((d) => d.tasks) || []),
      ...(monthQuery.data?.data.unscheduled || []),
    ];
    const first = allTasks.find((t) => t.projectId);
    if (!first || !first.projectId) {
      showToast('error', 'Open a task on the planner first to request a related task.');
      return;
    }
    setRequestTaskModal({
      projectId: first.projectId,
      projectLabel: `${first.projectNumber || ''} ${first.projectName || ''}`.trim(),
      linkedTaskId: null,
      title: '',
      description: '',
      justification: '',
      estimatedHours: '',
    });
  };

  const submitExtension = () => {
    if (!extensionModal) return;
    const hours = Number(extensionModal.requestedHours);
    if (!hours || Number.isNaN(hours) || hours <= 0) {
      showToast('error', 'Enter a positive number of hours.');
      return;
    }
    if (!extensionModal.reason.trim()) {
      showToast('error', 'Please give a reason for the extension.');
      return;
    }
    requestExtension.mutate({
      taskId: extensionModal.taskId,
      requestedHours: hours,
      reason: extensionModal.reason.trim(),
    });
  };

  const deletePlannerEntry = useMutation({
    mutationFn: (entryId: string) => api(`/project-management/my/planner/entry/${entryId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidatePlannerQueries();
      showToast('success', 'Task removed from plan.');
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to remove plan.'),
  });

  const monthGrid = useMemo(() => {
    const monthData = monthQuery.data?.data;
    if (!monthData) return [] as Array<{ date: string; inMonth: boolean; tasks: PlannerTask[] }>;

    const first = new Date(monthData.year, monthData.month - 1, 1);
    const firstDay = first.getDay();
    const mondayOffset = firstDay === 0 ? 6 : firstDay - 1;
    const startCell = addDays(first, -mondayOffset);

    const dayMap = new Map(monthData.days.map((d) => [d.date, d]));
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(startCell, i);
      const dateKey = ymd(date);
      const day = dayMap.get(dateKey);
      return {
        date: dateKey,
        inMonth: date.getMonth() === (monthData.month - 1),
        tasks: day?.tasks || [],
      };
    });
  }, [monthQuery.data]);

  const setMode = (nextMode: 'week' | 'month') => {
    const next = new URLSearchParams(params);
    next.set('mode', nextMode);
    if (nextMode === 'week' && !next.get('start')) next.set('start', ymd(weekStart));
    if (nextMode === 'month' && !next.get('month')) next.set('month', `${monthBase.year}-${String(monthBase.month).padStart(2, '0')}`);
    setParams(next);
  };

  const goWeek = (direction: -1 | 1) => {
    const next = addDays(weekStart, direction * 7);
    const search = new URLSearchParams(params);
    search.set('mode', 'week');
    search.set('start', ymd(next));
    setParams(search);
  };

  const goMonth = (direction: -1 | 1) => {
    const nextDate = new Date(monthBase.year, monthBase.month - 1 + direction, 1);
    const search = new URLSearchParams(params);
    search.set('mode', 'month');
    search.set('month', `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
    setParams(search);
  };

  const shiftDate = (value: string, offset: number) => {
    const parsed = parseYmd(value);
    if (!parsed) return value;
    return ymd(addDays(parsed, offset));
  };

  const handleDropOnDay = (date: string) => {
    // Resize takes priority over move/create
    if (resizing) {
      if (resizing.edge === 'end') {
        if (date < resizing.spanStart) {
          showToast('error', 'End date cannot be before the start date.');
        } else {
          updatePlannerEntry.mutate({
            entryId: resizing.entryId,
            endDate: date === resizing.spanStart ? null : date,
          });
        }
      } else {
        if (date > resizing.spanEnd) {
          showToast('error', 'Start date cannot be after the end date.');
        } else {
          updatePlannerEntry.mutate({
            entryId: resizing.entryId,
            plannedDate: date,
            endDate: date === resizing.spanEnd ? null : resizing.spanEnd,
          });
        }
      }
      setResizing(null);
      return;
    }

    if (!dragging) return;

    if (dragging.plannerEntryId) {
      updatePlannerEntry.mutate({ entryId: dragging.plannerEntryId, plannedDate: date });
    } else {
      createPlannerEntry.mutate({ taskAssignmentId: dragging.taskId, plannedDate: date });
    }
    setDragging(null);
  };

  const handleDropToBacklog = () => {
    if (!dragging?.plannerEntryId) return;
    deletePlannerEntry.mutate(dragging.plannerEntryId);
    setDragging(null);
  };

  const isOverAllocated = (task: PlannerTask) => {
    if (task.plannedHours == null) return false;
    return task.plannedHours > Number(task.remainingHours || 0);
  };

  const openEditModal = (task: PlannerTask) => {
    if (!task.plannerEntryId) return;
    setEditing({
      entryId: task.plannerEntryId,
      taskId: task.id,
      taskLabel: `${task.number} - ${task.title}`,
      startDate: task.spanStart || task.plannedDate || '',
      endDate: task.spanEnd || task.spanStart || task.plannedDate || '',
      plannedHours: task.plannedHours == null ? '' : String(task.plannedHours),
      note: task.note || '',
      remainingHours: Number(task.remainingHours || 0),
    });
  };

  const openPlanSpanModal = (task: PlannerTask) => {
    const today = ymd(new Date());
    setPlanSpanModal({
      taskId: task.id,
      taskLabel: `${task.number} - ${task.title}`,
      startDate: today,
      endDate: today,
      plannedHours: '',
      note: '',
      remainingHours: Number(task.remainingHours || 0),
    });
  };

  const submitPlanSpan = () => {
    if (!planSpanModal) return;
    if (!planSpanModal.startDate || !planSpanModal.endDate) {
      showToast('error', 'Pick a start and end date.');
      return;
    }
    if (planSpanModal.endDate < planSpanModal.startDate) {
      showToast('error', 'End date must be on or after the start date.');
      return;
    }
    const hours = planSpanModal.plannedHours.trim() === '' ? null : Number(planSpanModal.plannedHours);
    if (hours !== null && (Number.isNaN(hours) || hours < 0)) {
      showToast('error', 'Hours must be a positive number.');
      return;
    }
    if (hours !== null && hours > planSpanModal.remainingHours) {
      showToast('error', `Cannot plan ${hours}h — only ${planSpanModal.remainingHours.toFixed(1)}h remaining on this task.`);
      return;
    }
    createPlannerEntry.mutate(
      {
        taskAssignmentId: planSpanModal.taskId,
        plannedDate: planSpanModal.startDate,
        endDate: planSpanModal.endDate === planSpanModal.startDate ? null : planSpanModal.endDate,
        plannedHours: hours,
        note: planSpanModal.note.trim() || null,
      },
      { onSuccess: () => setPlanSpanModal(null) },
    );
  };

  const saveEditModal = () => {
    if (!editing) return;
    if (!editing.startDate || !editing.endDate) {
      showToast('error', 'Pick a start and end date.');
      return;
    }
    if (editing.endDate < editing.startDate) {
      showToast('error', 'End date must be on or after the start date.');
      return;
    }
    const trimmedHours = editing.plannedHours.trim();
    const parsedHours = trimmedHours === '' ? null : Number(trimmedHours);
    if (parsedHours !== null && Number.isNaN(parsedHours)) return;
    if (parsedHours !== null && parsedHours > editing.remainingHours) {
      showToast(
        'error',
        `Cannot plan ${parsedHours}h — only ${editing.remainingHours.toFixed(1)}h remaining. Request a time extension first.`,
      );
      return;
    }

    updatePlannerEntry.mutate(
      {
        entryId: editing.entryId,
        plannedDate: editing.startDate,
        endDate: editing.endDate === editing.startDate ? null : editing.endDate,
        plannedHours: parsedHours,
        note: editing.note.trim() || null,
      },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <div>
      {toast && (
        <div className="mb-3">
          <div className={`rounded border px-3 py-2 text-sm ${toast.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {toast.message}
          </div>
        </div>
      )}
      <PageHeader
        title="My Planner"
        subtitle="Track your weekly and monthly schedule at a glance"
        action={
          <button
            type="button"
            onClick={() => openRequestTaskModal()}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            + Request Task
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex card p-1">
          <button
            type="button"
            onClick={() => setMode('week')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setMode('month')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'month' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            Month
          </button>
        </div>

        {mode === 'week' ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goWeek(-1)} className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Prev</button>
            <span className="text-sm font-medium text-gray-700">
              {weekQuery.data?.data.weekStart || ymd(weekStart)} to {weekQuery.data?.data.weekEnd || ymd(addDays(weekStart, 6))}
            </span>
            <button type="button" onClick={() => goWeek(1)} className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Next</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goMonth(-1)} className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Prev</button>
            <span className="text-sm font-medium text-gray-700">
              {new Date(monthBase.year, monthBase.month - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={() => goMonth(1)} className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Next</button>
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase text-gray-500">Unique Tasks</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{activeTotals?.uniqueTasks ?? 0}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase text-gray-500">Scheduled Instances</p>
          <p className="mt-1 text-xl font-semibold text-blue-700">{activeTotals?.scheduledTasks ?? 0}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase text-gray-500">Unscheduled</p>
          <p className="mt-1 text-xl font-semibold text-orange-600">{activeTotals?.unscheduledTasks ?? 0}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase text-gray-500">Overdue</p>
          <p className="mt-1 text-xl font-semibold text-red-600">{activeTotals?.overdueTasks ?? 0}</p>
        </div>
      </div>

      {mode === 'week' && (
        <div className="space-y-4">
          {weekQuery.isLoading && <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading weekly planner...</div>}

          {weekQuery.data && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {weekQuery.data.data.days.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-lg border bg-white p-3 ${dragging ? 'border-blue-300' : 'border-gray-200'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnDay(day.date)}
                >
                  <p className="text-xs uppercase text-gray-500">{day.dayName}</p>
                  <p className="mb-2 text-lg font-semibold text-gray-900">{day.dayOfMonth}</p>
                  <div className="space-y-2">
                    {day.tasks.length === 0 && <p className="text-xs text-gray-400">No tasks</p>}
                    {day.tasks.map((task) => (
                      <div
                        key={`${day.date}-${task.id}-${task.plannerEntryId || 'task'}`}
                        className="relative rounded border border-gray-200 px-2 py-1.5 text-xs hover:bg-gray-50"
                        draggable
                        onDragStart={() => setDragging({ taskId: task.id, plannerEntryId: task.plannerEntryId })}
                        onDragEnd={() => setDragging(null)}
                      >
                        {task.plannerEntryId && task.spanTotalDays && task.spanTotalDays > 1 && task.spanDayIndex === 1 && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setResizing({
                                entryId: task.plannerEntryId!,
                                edge: 'start',
                                spanStart: task.spanStart!,
                                spanEnd: task.spanEnd!,
                              });
                            }}
                            onDragEnd={() => setResizing(null)}
                            title="Drag to change start date"
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l bg-purple-400 hover:bg-purple-600"
                          />
                        )}
                        {task.plannerEntryId && task.spanTotalDays && task.spanTotalDays > 1 && task.spanDayIndex === task.spanTotalDays && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setResizing({
                                entryId: task.plannerEntryId!,
                                edge: 'end',
                                spanStart: task.spanStart!,
                                spanEnd: task.spanEnd!,
                              });
                            }}
                            onDragEnd={() => setResizing(null)}
                            title="Drag to change end date"
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r bg-purple-400 hover:bg-purple-600"
                          />
                        )}
                        <Link to={`/pm/tasks/${task.id}`} className="block">
                          <p className="font-medium text-gray-800">{task.number}</p>
                          <p className="truncate text-gray-600">{task.title}</p>
                          {task.spanTotalDays && task.spanTotalDays > 1 && (
                            <p className="text-[10px] text-purple-700">
                              Day {task.spanDayIndex} of {task.spanTotalDays}
                              {task.plannedHoursPerDay != null && ` · ${task.plannedHoursPerDay.toFixed(1)}h/day`}
                            </p>
                          )}
                          {task.plannedHours != null && (
                            <p className="text-[10px] text-blue-700">
                              {task.plannedHours.toFixed(1)}h{task.spanTotalDays && task.spanTotalDays > 1 ? ' total' : ''}
                            </p>
                          )}
                          {isOverAllocated(task) && (
                            <p className="text-[10px] font-medium text-red-600">Planned hours exceed remaining hours</p>
                          )}
                        </Link>
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded border border-blue-200 px-1 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50"
                            onClick={() => openLogHoursModal(task, day.date)}
                          >
                            Log
                          </button>
                          {task.plannerEntryId && (
                            <>
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                                onClick={() => openEditModal(task)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                                onClick={() => updatePlannerEntry.mutate({ entryId: task.plannerEntryId!, plannedDate: shiftDate(day.date, -1) })}
                              >
                                -1d
                              </button>
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                                onClick={() => updatePlannerEntry.mutate({ entryId: task.plannerEntryId!, plannedDate: shiftDate(day.date, 1) })}
                              >
                                +1d
                              </button>
                              <button
                                type="button"
                                className="rounded border border-red-200 px-1 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                                onClick={() => deletePlannerEntry.mutate(task.plannerEntryId!)}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {weekQuery.data && weekQuery.data.data.unscheduled.length > 0 && (
            <div
              className={`rounded border p-4 ${dragging?.plannerEntryId ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropToBacklog}
            >
              <h3 className="text-sm font-semibold text-orange-800">Unscheduled Tasks</h3>
              <p className="mb-2 text-xs text-orange-700">Drag onto a day for a single-day plan, or click <strong>Plan span</strong> to schedule across multiple days.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {weekQuery.data.data.unscheduled.map((task) => (
                  <div
                    key={task.id}
                    className="rounded border border-orange-200 bg-white px-2 py-1.5 text-xs text-orange-900 hover:bg-orange-100"
                    draggable
                    onDragStart={() => setDragging({ taskId: task.id })}
                    onDragEnd={() => setDragging(null)}
                  >
                    <Link to={`/pm/tasks/${task.id}`} className="block">
                      {task.number} - {task.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => openPlanSpanModal(task)}
                      className="mt-1 rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700 hover:bg-purple-100"
                    >
                      Plan span
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'month' && (
        <div>
          {monthQuery.isLoading && <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading monthly planner...</div>}

          {monthQuery.data && (
            <div className="card p-3">
              <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-gray-500">
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
                <div>Sun</div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthGrid.map((cell) => (
                  <div
                    key={cell.date}
                    className={`min-h-24 rounded border p-2 ${cell.inMonth ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnDay(cell.date)}
                  >
                    <p className="text-xs font-semibold">{new Date(cell.date).getDate()}</p>
                    <p className="text-[11px] text-gray-500">{cell.tasks.length} task{cell.tasks.length === 1 ? '' : 's'}</p>
                    <div className="mt-1 space-y-1">
                      {cell.tasks.slice(0, 2).map((task) => (
                        <div
                          key={`${cell.date}-${task.id}-${task.plannerEntryId || 'task'}`}
                          className={`rounded px-1.5 py-0.5 ${isOverAllocated(task) ? 'border border-red-300 bg-red-50' : 'bg-blue-50'}`}
                          draggable
                          onDragStart={() => setDragging({ taskId: task.id, plannerEntryId: task.plannerEntryId })}
                          onDragEnd={() => setDragging(null)}
                          title={task.title}
                        >
                          <Link to={`/pm/tasks/${task.id}`} className="block truncate text-[10px] text-blue-700 hover:bg-blue-100">
                            {task.number}
                          </Link>
                          {task.plannerEntryId && (
                            <div className="mt-1 flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-1 text-[9px] text-gray-600 hover:bg-gray-100"
                                onClick={() => openEditModal(task)}
                              >
                                E
                              </button>
                              <button
                                type="button"
                                className="rounded border border-red-200 px-1 text-[9px] text-red-600 hover:bg-red-50"
                                onClick={() => deletePlannerEntry.mutate(task.plannerEntryId!)}
                              >
                                X
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {monthQuery.data && monthQuery.data.data.unscheduled.length > 0 && (
            <div
              className={`mt-4 rounded border p-4 ${dragging?.plannerEntryId ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropToBacklog}
            >
              <h3 className="text-sm font-semibold text-orange-800">Unscheduled Tasks</h3>
              <p className="mb-2 text-xs text-orange-700">Drag tasks here to unplan, or drag these tasks onto any calendar day to plan them.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {monthQuery.data.data.unscheduled.map((task) => (
                  <div
                    key={task.id}
                    className="rounded border border-orange-200 bg-white px-2 py-1.5 text-xs text-orange-900 hover:bg-orange-100"
                    draggable
                    onDragStart={() => setDragging({ taskId: task.id })}
                    onDragEnd={() => setDragging(null)}
                  >
                    <Link to={`/pm/tasks/${task.id}`} className="block">
                      {task.number} - {task.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() => openPlanSpanModal(task)}
                      className="mt-1 rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700 hover:bg-purple-100"
                    >
                      Plan span
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Edit Planned Task</h3>
            <p className="mt-1 text-xs text-gray-500">{editing.taskLabel}</p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Start date</label>
                  <input
                    type="date"
                    value={editing.startDate}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, startDate: e.target.value } : prev)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">End date</label>
                  <input
                    type="date"
                    value={editing.endDate}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, endDate: e.target.value } : prev)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Planned Hours <span className="text-gray-400">(total across the span)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.25"
                  value={editing.plannedHours}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, plannedHours: e.target.value } : prev)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
                {editing.plannedHours.trim() !== '' && !Number.isNaN(Number(editing.plannedHours)) && Number(editing.plannedHours) > editing.remainingHours && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    Warning: planned hours exceed remaining task hours ({editing.remainingHours.toFixed(1)}h).
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Note</label>
                <textarea
                  rows={3}
                  value={editing.note}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, note: e.target.value } : prev)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional planner note"
                />
              </div>
            </div>

            {editing.remainingHours <= 0 && (
              <p className="mt-3 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                You've used all allocated hours on this task. Request a time extension to continue planning work.
              </p>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="mr-auto rounded border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm text-orange-800 hover:bg-orange-100"
                onClick={() => {
                  setExtensionModal({
                    taskId: editing.taskId,
                    taskLabel: editing.taskLabel,
                    requestedHours: '',
                    reason: '',
                  });
                }}
              >
                Request time extension
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={saveEditModal}
                disabled={
                  updatePlannerEntry.isPending ||
                  (editing.plannedHours.trim() !== '' &&
                    !Number.isNaN(Number(editing.plannedHours)) &&
                    Number(editing.plannedHours) > editing.remainingHours)
                }
              >
                Save Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {extensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Request Time Extension</h3>
            <p className="mt-1 text-xs text-gray-500">{extensionModal.taskLabel}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Additional hours requested</label>
                <input
                  type="number"
                  min={0.25}
                  step="0.25"
                  value={extensionModal.requestedHours}
                  onChange={(e) =>
                    setExtensionModal((prev) => (prev ? { ...prev, requestedHours: e.target.value } : prev))
                  }
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. 4"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
                <textarea
                  rows={3}
                  value={extensionModal.reason}
                  onChange={(e) => setExtensionModal((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Explain why more time is needed"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setExtensionModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                onClick={submitExtension}
                disabled={requestExtension.isPending}
              >
                {requestExtension.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logHoursModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Log Hours</h3>
            <p className="mt-1 text-xs text-gray-500">{logHoursModal.taskLabel}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Work date</label>
                <input
                  type="date"
                  value={logHoursModal.workDate}
                  onChange={(e) => setLogHoursModal((prev) => (prev ? { ...prev, workDate: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Hours</label>
                <input
                  type="number"
                  min={0.25}
                  step="0.25"
                  value={logHoursModal.hours}
                  onChange={(e) => setLogHoursModal((prev) => (prev ? { ...prev, hours: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. 2.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">What did you do?</label>
                <textarea
                  rows={3}
                  value={logHoursModal.description}
                  onChange={(e) => setLogHoursModal((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Brief description of work performed"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setLogHoursModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submitLogHours}
                disabled={logHoursMutation.isPending}
              >
                {logHoursMutation.isPending ? 'Logging…' : 'Log Hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Request Additional Task</h3>
            <p className="mt-1 text-xs text-gray-500">Project: {requestTaskModal.projectLabel}</p>
            {requestTaskModal.linkedTaskId && (
              <p className="text-xs text-blue-700">Linked to a task you're working on</p>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Task title</label>
                <input
                  type="text"
                  value={requestTaskModal.title}
                  onChange={(e) => setRequestTaskModal((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Re-edit chapter 3 after author rewrite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">What you'd be doing</label>
                <textarea
                  rows={3}
                  value={requestTaskModal.description}
                  onChange={(e) => setRequestTaskModal((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Why is this needed?</label>
                <textarea
                  rows={2}
                  value={requestTaskModal.justification}
                  onChange={(e) => setRequestTaskModal((prev) => (prev ? { ...prev, justification: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="What surfaced this work?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Estimated hours</label>
                <input
                  type="number"
                  min={0.25}
                  step="0.25"
                  value={requestTaskModal.estimatedHours}
                  onChange={(e) => setRequestTaskModal((prev) => (prev ? { ...prev, estimatedHours: e.target.value } : prev))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setRequestTaskModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submitTaskRequest}
                disabled={requestTaskMutation.isPending}
              >
                {requestTaskMutation.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {planSpanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md card p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Plan Task Across Days</h3>
            <p className="mt-1 text-xs text-gray-500">{planSpanModal.taskLabel}</p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Start date</label>
                  <input
                    type="date"
                    value={planSpanModal.startDate}
                    onChange={(e) => setPlanSpanModal((prev) => prev ? { ...prev, startDate: e.target.value } : prev)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">End date</label>
                  <input
                    type="date"
                    value={planSpanModal.endDate}
                    onChange={(e) => setPlanSpanModal((prev) => prev ? { ...prev, endDate: e.target.value } : prev)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Total planned hours <span className="text-gray-400">(across the whole span)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.25"
                  value={planSpanModal.plannedHours}
                  onChange={(e) => setPlanSpanModal((prev) => prev ? { ...prev, plannedHours: e.target.value } : prev)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={`Up to ${planSpanModal.remainingHours.toFixed(1)}h`}
                />
                {planSpanModal.startDate && planSpanModal.endDate && planSpanModal.plannedHours && (() => {
                  const days = Math.max(1, Math.round((new Date(planSpanModal.endDate).getTime() - new Date(planSpanModal.startDate).getTime()) / 86400000) + 1);
                  const perDay = Number(planSpanModal.plannedHours) / days;
                  return (
                    <p className="mt-1 text-[11px] text-gray-500">
                      {days} day{days === 1 ? '' : 's'} · ~{perDay.toFixed(1)}h/day
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Note</label>
                <textarea
                  rows={2}
                  value={planSpanModal.note}
                  onChange={(e) => setPlanSpanModal((prev) => prev ? { ...prev, note: e.target.value } : prev)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setPlanSpanModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                onClick={submitPlanSpan}
                disabled={createPlannerEntry.isPending}
              >
                {createPlannerEntry.isPending ? 'Saving…' : 'Plan Span'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
