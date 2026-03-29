import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface Milestone {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  number: string;
  milestones: Milestone[];
}

interface TimeEntry {
  key: string;
  milestoneId: string;
  workDate: string;
  hours: string;
  description: string;
}

function emptyEntry(): TimeEntry {
  return {
    key: crypto.randomUUID(),
    milestoneId: '',
    workDate: '',
    hours: '',
    description: '',
  };
}

export function TimesheetCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<TimeEntry[]>([emptyEntry()]);

  const { data: projectsData } = useQuery({
    queryKey: ['budgeting-projects-all'],
    queryFn: () =>
      api<{ data: Project[] }>('/budgeting/projects?limit=500'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () =>
      api<{ data: { id: string; name: string }[] }>('/users?limit=500'),
  });

  // Fetch milestones for the selected project
  const { data: milestonesData } = useQuery({
    queryKey: ['budgeting-project-milestones', projectId],
    queryFn: () =>
      api<{ data: Milestone[] }>(`/budgeting/projects/${projectId}/milestones`),
    enabled: !!projectId,
  });

  const projects = projectsData?.data ?? [];
  const users = usersData?.data ?? [];
  const milestones = milestonesData?.data ?? [];

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.number} — ${p.name}`,
  }));

  const workerOptions = users.map((u) => ({
    value: u.id,
    label: u.name,
  }));

  const milestoneOptions = milestones.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/budgeting/timesheets', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      navigate('/budgeting/timesheets');
    },
  });

  function updateEntry(key: string, field: keyof TimeEntry, value: string) {
    setEntries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)),
    );
  }

  function removeEntry(key: string) {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.key !== key)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }

  const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!projectId) {
      setError('Please select a project.');
      return;
    }
    if (!workerId) {
      setError('Please select a worker.');
      return;
    }
    if (!periodFrom || !periodTo) {
      setError('Please specify the period from and to dates.');
      return;
    }

    const validEntries = entries.filter(
      (e) => e.workDate && Number(e.hours) > 0 && e.description,
    );
    if (validEntries.length === 0) {
      setError('At least one valid time entry is required.');
      return;
    }

    mutation.mutate(
      {
        projectId,
        workerId,
        periodFrom,
        periodTo,
        notes: notes || undefined,
        entries: validEntries.map((e) => ({
          milestoneId: e.milestoneId || undefined,
          workDate: e.workDate,
          hours: Number(e.hours),
          description: e.description,
        })),
      },
      { onError: (err) => setError(err.message) },
    );
  }

  const cls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <UnsavedChangesGuard hasUnsavedChanges={isDirty} />
      <PageHeader title="New Timesheet" backTo={{ label: 'Timesheets', href: '/budgeting/timesheets' }} />

      <form onSubmit={handleSubmit} onChange={() => !isDirty && setIsDirty(true)} className="max-w-5xl space-y-6">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
            <SearchableSelect
              options={projectOptions}
              value={projectId}
              onChange={(v) => { setProjectId(v); setIsDirty(true); }}
              placeholder="Search projects..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Worker *</label>
            <SearchableSelect
              options={workerOptions}
              value={workerId}
              onChange={(v) => { setWorkerId(v); setIsDirty(true); }}
              placeholder="Search workers..."
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period From *</label>
            <input
              type="date"
              required
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className={cls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period To *</label>
            <input
              type="date"
              required
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className={cls}
            />
          </div>
        </div>

        {/* Time Entries */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Entries</label>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Work Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((entry) => (
                  <tr key={entry.key}>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        options={milestoneOptions}
                        value={entry.milestoneId}
                        onChange={(v) => updateEntry(entry.key, 'milestoneId', v)}
                        placeholder="Select milestone..."
                        disabled={!projectId}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={entry.workDate}
                        onChange={(e) => updateEntry(entry.key, 'workDate', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={entry.hours}
                        onChange={(e) => updateEntry(entry.key, 'hours', e.target.value)}
                        className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={entry.description}
                        onChange={(e) => updateEntry(entry.key, 'description', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        placeholder="What was done..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.key)}
                        className="text-red-400 hover:text-red-600 text-sm"
                        title="Remove entry"
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addEntry}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            + Add Entry
          </button>
        </div>

        {/* Total Hours */}
        <div className="flex justify-end">
          <div className="text-right">
            <span className="text-sm text-gray-500 mr-3">Total Hours:</span>
            <span className="text-lg font-bold font-mono">{totalHours.toFixed(1)}h</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={cls}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Timesheet'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/budgeting/timesheets')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
