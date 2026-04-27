import { useState } from 'react';

interface Props { projectId: string; projectNumber: string }

const REPORTS = [
  {
    key:      'executive',
    title:    'Executive Summary',
    desc:     'One-page snapshot: health, KPIs, phase progress, next milestone, top risks. Ideal for steering committee.',
    icon:     '📊',
    color:    'bg-indigo-50 border-indigo-200',
    btnColor: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    key:      'status',
    title:    'Project Status Report',
    desc:     'Full PM view: task breakdown, all open issues, risk register, sprint progress, milestone tracking.',
    icon:     '📋',
    color:    'bg-blue-50 border-blue-200',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    key:      'detailed',
    title:    'Detailed Audit Report',
    desc:     'Complete project record: every task, every issue, full risk register, sprint history, team roster.',
    icon:     '🔍',
    color:    'bg-gray-50 border-gray-200',
    btnColor: 'bg-gray-700 hover:bg-gray-800',
  },
] as const;

export function BilletterieReports({ projectId, projectNumber }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  async function downloadReport(tier: string) {
    setLoading(tier);
    try {
      const res = await fetch(`/api/v1/billetterie/projects/${projectId}/reports/${tier}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${projectNumber}-${tier}-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'Error generating report');
    } finally {
      setLoading(null);
    }
  }

  async function downloadSow() {
    setLoading('sow');
    try {
      const res = await fetch(`/api/v1/billetterie/projects/${projectId}/sow/pdf`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${projectNumber}-SOW.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'Error generating SOW');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Reports & Documents</h2>
        <p className="text-xs text-gray-500 mt-0.5">Generate PDF reports from live project data. All reports are generated on demand.</p>
      </div>

      {/* SOW */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-4">
        <span className="text-3xl flex-shrink-0">📄</span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Statement of Work (SOW)</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Client-facing document: project overview, team, phase plan, milestones, risk summary and sign-off page.
          </p>
          <button
            onClick={downloadSow}
            disabled={loading === 'sow'}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading === 'sow' ? (
              <><span className="animate-spin">⏳</span> Generating…</>
            ) : (
              <><span>⬇</span> Download SOW PDF</>
            )}
          </button>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid gap-4">
        {REPORTS.map(r => (
          <div key={r.key} className={`border rounded-xl p-5 flex items-start gap-4 ${r.color}`}>
            <span className="text-3xl flex-shrink-0">{r.icon}</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">{r.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">{r.desc}</p>
              <button
                onClick={() => downloadReport(r.key)}
                disabled={!!loading}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2 ${r.btnColor}`}
              >
                {loading === r.key ? (
                  <><span className="animate-spin">⏳</span> Generating…</>
                ) : (
                  <><span>⬇</span> Download PDF</>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Reports are generated from live data and reflect the current state of the project at time of download.
        For formal sign-off, use the SOW document.
      </div>
    </div>
  );
}
