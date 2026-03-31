import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';

function utilizationColor(pct: number): string {
  if (pct > 100) return 'text-red-600 font-bold';
  if (pct >= 80) return 'text-yellow-600 font-medium';
  if (pct >= 50) return 'text-green-700 font-medium';
  return 'text-gray-500';
}

function utilizationBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  if (pct >= 50) return 'bg-green-500';
  return 'bg-gray-300';
}

function utilizationBg(pct: number): string {
  if (pct > 100) return 'bg-red-50';
  if (pct >= 80) return 'bg-yellow-50';
  return '';
}

export function ResourcePlanning() {
  const [skillFilter, setSkillFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');

  // Staff with capacity data
  const { data: capacityData, isLoading: capLoading } = useQuery({
    queryKey: ['pm-capacity'],
    queryFn: () => api<{ data: any[] }>('/project-management/capacity'),
  });

  // All staff for enriched data
  const { data: staffData } = useQuery({
    queryKey: ['pm-all-staff'],
    queryFn: () => api<{ data: any[] }>('/project-management/staff?limit=200'),
  });

  // All projects for breakdown
  const { data: projectsData } = useQuery({
    queryKey: ['pm-all-projects-resource'],
    queryFn: () => api<{ data: any[] }>('/budgeting/projects?limit=100'),
  });

  const capacity = capacityData?.data || [];
  const allStaff = staffData?.data || [];

  // Merge capacity data with staff data
  const enriched = allStaff.filter((s: any) => s.isActive !== false).map((s: any) => {
    const cap = capacity.find((c: any) => (c.staffId || c.id) === s.id);
    const maxHours = Number(s.maxHoursPerWeek || 40);
    const allocated = Number(cap?.allocatedThisWeek ?? cap?.allocated_this_week ?? 0);
    const available = Math.max(0, maxHours - allocated);
    const utilPct = maxHours > 0 ? (allocated / maxHours) * 100 : 0;
    const skills = Array.isArray(s.skills) ? s.skills : [];
    return { ...s, maxHours, allocated, available, utilPct, skills };
  });

  // Apply filters
  const filtered = enriched.filter((s: any) => {
    if (skillFilter && !s.skills.some((sk: string) => sk.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
    if (availabilityFilter === 'AVAILABLE' && s.available <= 0) return false;
    if (availabilityFilter === 'OVERLOADED' && s.utilPct <= 100) return false;
    return true;
  });

  // Summary stats
  const totalStaff = enriched.length;
  const overloaded = enriched.filter((s: any) => s.utilPct > 100).length;
  const fullyAvailable = enriched.filter((s: any) => s.allocated === 0).length;
  const totalCapacityHours = enriched.reduce((s: number, r: any) => s + r.maxHours, 0);
  const totalAllocatedHours = enriched.reduce((s: number, r: any) => s + r.allocated, 0);
  const overallUtilization = totalCapacityHours > 0 ? (totalAllocatedHours / totalCapacityHours) * 100 : 0;

  // Unique skills for filter
  const allSkills = [...new Set(enriched.flatMap((s: any) => s.skills as string[]))].sort();

  return (
    <div>
      <PageHeader
        title="Resource Planning"
        subtitle="Staff capacity, availability, and allocation across all projects"
        action={
          <Link to="/pm/staff/new" className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
            Add Staff
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Staff</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalStaff}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Overall Utilization</p>
          <p className={`mt-1 text-2xl font-bold ${utilizationColor(overallUtilization)}`}>{overallUtilization.toFixed(0)}%</p>
          <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
            <div className={`h-2 rounded-full ${utilizationBarColor(overallUtilization)}`} style={{ width: `${Math.min(100, overallUtilization)}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Capacity</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalCapacityHours}h/wk</p>
          <p className="text-xs text-gray-400">{totalAllocatedHours}h allocated</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-600 uppercase">Fully Available</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{fullyAvailable}</p>
          <p className="text-xs text-green-500">No tasks assigned</p>
        </div>
        <div className={`rounded-lg border p-4 ${overloaded > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <p className={`text-xs uppercase ${overloaded > 0 ? 'text-red-600' : 'text-gray-500'}`}>Overloaded</p>
          <p className={`mt-1 text-2xl font-bold ${overloaded > 0 ? 'text-red-700' : 'text-gray-900'}`}>{overloaded}</p>
          {overloaded > 0 && <p className="text-xs text-red-500">Over 100% utilization</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Skills</option>
          {allSkills.map((sk) => (
            <option key={sk} value={sk}>{sk.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="ALL">All Staff</option>
          <option value="AVAILABLE">Available Only (has capacity)</option>
          <option value="OVERLOADED">Overloaded Only (&gt;100%)</option>
        </select>
      </div>

      {/* Staff Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Member</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Skills</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Capacity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {capLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            )}
            {filtered.map((s: any) => (
              <tr key={s.id} className={`hover:bg-gray-50 cursor-pointer ${utilizationBg(s.utilPct)}`}
                onClick={() => window.location.href = `/pm/staff/${s.id}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                      {(s.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.role}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(s.skills as string[]).slice(0, 3).map((sk: string) => (
                      <span key={sk} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{sk.replace(/_/g, ' ')}</span>
                    ))}
                    {s.skills.length > 3 && <span className="text-[10px] text-gray-400">+{s.skills.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{s.availabilityType?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{s.maxHours}h</td>
                <td className="px-4 py-3 text-sm text-right font-mono">{s.allocated}h</td>
                <td className="px-4 py-3 text-sm text-right font-mono">
                  <span className={s.available > 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                    {s.available}h
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${utilizationBarColor(s.utilPct)}`}
                        style={{ width: `${Math.min(100, s.utilPct)}%` }} />
                    </div>
                    <span className={`text-xs w-10 text-right ${utilizationColor(s.utilPct)}`}>
                      {s.utilPct.toFixed(0)}%
                    </span>
                  </div>
                  {s.utilPct > 100 && (
                    <p className="text-[10px] text-red-600 font-medium mt-0.5">OVERLOADED</p>
                  )}
                </td>
              </tr>
            ))}
            {!capLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                {enriched.length === 0 ? 'No staff members yet.' : 'No staff match the current filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-gray-300" /> &lt;50% — Underutilized</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500" /> 50-80% — Optimal</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-yellow-500" /> 80-100% — Near Capacity</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> &gt;100% — Overloaded</div>
      </div>
    </div>
  );
}
