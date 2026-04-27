import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../../../lib/api';
import {
  TASK_STATUS_BADGE, TASK_STATUS_LABEL, PRIORITY_DOT, PRIORITY_BADGE,
  getInitials, isOverdue, PHASES,
} from '../billetterie-constants';

interface Props {
  projectId: string;
}

const COLUMNS = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
type Status = typeof COLUMNS[number];

const COL_COLORS: Record<string, string> = {
  TODO:        'border-t-gray-300',
  IN_PROGRESS: 'border-t-blue-400',
  REVIEW:      'border-t-purple-400',
  DONE:        'border-t-green-400',
};

function TaskCard({ task, isDragging = false }: { task: any; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const phase = PHASES.find((p) => p.key === task.phaseKey);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm space-y-2 transition-opacity ${isSortDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-gray-400'}`} title={task.priority} />
        {phase && (
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{phase.label}</span>
        )}
        {task.storyPoints != null && (
          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{task.storyPoints}pt</span>
        )}
        {(task.labels ?? []).slice(0, 3).map((l: string) => (
          <span key={l} className="text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{l}</span>
        ))}
      </div>
      <div className="flex items-center justify-between">
        {task.assignee ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-semibold">
              {getInitials(task.assignee.name ?? '?')}
            </span>
            {task.assignee.name?.split(' ')[0]}
          </span>
        ) : (
          <span className="text-xs text-gray-300">Unassigned</span>
        )}
        {task.dueDate && (
          <span className={`text-[10px] font-medium ${isOverdue(task.dueDate) && task.status !== 'DONE' ? 'text-red-600' : 'text-gray-400'}`}>
            {task.dueDate}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ status, tasks }: { status: Status; tasks: any[] }) {
  return (
    <div className={`flex-1 min-w-60 bg-gray-50 rounded-xl border-t-4 ${COL_COLORS[status]} p-3 flex flex-col gap-2`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TASK_STATUS_BADGE[status]}`}>
          {TASK_STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-gray-400 font-mono">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-12">
          {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      </SortableContext>
    </div>
  );
}

export function BilletterieKanban({ projectId }: Props) {
  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<any>(null);
  const [tasks, setTasks] = useState<any[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data } = useQuery({
    queryKey: ['bil-tasks-kanban', projectId],
    queryFn: () => api<{ data: any[] }>(`/billetterie/projects/${projectId}/tasks`),
  });

  useEffect(() => {
    if (data && !tasks) setTasks((data as any).data ?? []);
  }, [data]);

  const reorderMutation = useMutation({
    mutationFn: (updates: any[]) => api(`/billetterie/projects/${projectId}/tasks/reorder`, {
      method: 'PUT', body: JSON.stringify({ updates }),
    }),
  });

  const liveTasks = tasks ?? (data as any)?.data ?? [];
  const byStatus = Object.fromEntries(COLUMNS.map((col) => [col, liveTasks.filter((t: any) => t.status === col).sort((a: any, b: any) => a.position - b.position)]));

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(liveTasks.find((t: any) => t.id === event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeTask = liveTasks.find((t: any) => t.id === active.id);
    const overTask   = liveTasks.find((t: any) => t.id === over.id);
    if (!activeTask) return;

    const newStatus: string = overTask ? overTask.status : (over.id as string);
    const newTasks = liveTasks.map((t: any) => t.id === activeTask.id ? { ...t, status: newStatus } : t);
    setTasks(newTasks);

    // Build reorder payload
    const updates = newTasks
      .filter((t: any) => COLUMNS.includes(t.status))
      .map((t: any, i: number) => ({ taskId: t.id, position: i, status: t.status }));
    reorderMutation.mutate(updates, { onError: () => setTasks((data as any)?.data ?? null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>Showing {liveTasks.filter((t: any) => t.status !== 'CANCELLED').length} tasks</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column key={col} status={col} tasks={byStatus[col] ?? []} />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="bg-white border-2 border-blue-300 rounded-lg p-3 shadow-xl opacity-90 w-64">
              <p className="text-sm font-medium text-gray-900 line-clamp-2">{activeTask.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
