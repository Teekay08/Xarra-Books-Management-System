import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import type { WorkflowStage } from './WorkflowStepper';

interface WorkflowGuideResponse {
  data: Array<{
    projectId: string;
    stage: string;
    progressPercent: number;
    blockers: string[];
    stages: WorkflowStage[];
    nextAction: { code: string; label: string; href: string };
  }>;
}

interface WorkflowBannerProps {
  projectId: string;
  projectName?: string;
}

export function WorkflowBanner({ projectId, projectName }: WorkflowBannerProps) {
  const { data } = useQuery({
    queryKey: ['workflow-guide-banner', projectId],
    queryFn: () => api<WorkflowGuideResponse>(`/project-management/projects/workflow-guide?projectIds=${projectId}`),
    staleTime: 30_000,
  });

  const guide = data?.data?.[0];
  if (!guide) return null;

  const currentStage = guide.stages?.find(
    (s) => s.status === 'CURRENT' || s.status === 'BLOCKED',
  ) ?? guide.stages?.[0];

  const stageIndex = guide.stages ? guide.stages.findIndex((s) => s === currentStage) + 1 : null;
  const totalStages = guide.stages?.length ?? 8;
  const hasBlockers = (currentStage?.blockers?.length ?? 0) > 0;

  return (
    <div className={[
      'mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm',
      hasBlockers
        ? 'border-amber-200 bg-amber-50'
        : 'border-blue-100 bg-blue-50',
    ].join(' ')}>
      {/* Back to overview */}
      <Link
        to={`/pm/projects/${projectId}`}
        className={[
          'flex-shrink-0 flex items-center gap-1 text-xs font-medium hover:underline',
          hasBlockers ? 'text-amber-800' : 'text-blue-700',
        ].join(' ')}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {projectName ? projectName : 'Overview'}
      </Link>

      <span className={hasBlockers ? 'text-amber-300' : 'text-blue-200'}>|</span>

      {/* Stage indicator */}
      <span className={[
        'flex-shrink-0 text-xs font-semibold',
        hasBlockers ? 'text-amber-900' : 'text-blue-800',
      ].join(' ')}>
        {stageIndex !== null ? `Stage ${stageIndex}/${totalStages}: ` : ''}{currentStage?.name}
      </span>

      {/* Progress bar */}
      <div className="flex-1 hidden sm:flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={['h-full rounded-full transition-all', hasBlockers ? 'bg-amber-500' : 'bg-blue-500'].join(' ')}
            style={{ width: `${guide.progressPercent}%` }}
          />
        </div>
        <span className="text-[11px] text-gray-500 flex-shrink-0">{guide.progressPercent}%</span>
      </div>

      {/* Blockers */}
      {hasBlockers && currentStage && (
        <span className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-800">
          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {currentStage.blockers[0]}
          {currentStage.blockers.length > 1 && (
            <span className="text-amber-600">+{currentStage.blockers.length - 1} more</span>
          )}
        </span>
      )}

      {/* Next action CTA */}
      {guide.nextAction?.href && (
        <Link
          to={guide.nextAction.href}
          className={[
            'flex-shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors',
            hasBlockers
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}
        >
          {guide.nextAction.label} →
        </Link>
      )}
    </div>
  );
}
