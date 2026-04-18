import { useNavigate } from 'react-router';

export type WorkflowStageStatus = 'COMPLETED' | 'CURRENT' | 'BLOCKED' | 'UPCOMING';

export interface WorkflowStage {
  key: string;
  name: string;
  status: WorkflowStageStatus;
  blockers: string[];
  action?: { label: string; href: string };
}

interface WorkflowStepperProps {
  stages: WorkflowStage[];
  projectId: string;
  /** Show the stage name label below each step. Defaults to true. */
  showLabels?: boolean;
}

export function WorkflowStepper({ stages, projectId, showLabels = true }: WorkflowStepperProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-1">
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        const clickable = !!stage.action?.href;

        return (
          <div key={stage.key} className="flex items-center flex-shrink-0">
            {/* Step node + label */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={!clickable}
                title={stage.blockers.length > 0 ? stage.blockers.join(' · ') : stage.name}
                onClick={() => clickable && navigate(stage.action!.href)}
                className={[
                  'relative w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                  stage.status === 'COMPLETED'
                    ? 'bg-green-600 border-green-600 text-white'
                    : stage.status === 'CURRENT'
                    ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100'
                    : stage.status === 'BLOCKED'
                    ? 'bg-amber-400 border-amber-400 text-white ring-4 ring-amber-100'
                    : 'bg-white border-gray-300 text-gray-400',
                  clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default',
                ].join(' ')}
              >
                {stage.status === 'COMPLETED' && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {stage.status === 'BLOCKED' && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
                {(stage.status === 'CURRENT' || stage.status === 'UPCOMING') && (
                  <span className="text-[11px] font-bold">{i + 1}</span>
                )}
              </button>

              {showLabels && (
                <span
                  className={[
                    'mt-1 text-center text-[10px] font-medium leading-tight max-w-[64px]',
                    stage.status === 'COMPLETED' ? 'text-green-700' :
                    stage.status === 'CURRENT' ? 'text-blue-700' :
                    stage.status === 'BLOCKED' ? 'text-amber-700' :
                    'text-gray-400',
                  ].join(' ')}
                >
                  {stage.name}
                </span>
              )}
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={[
                  'h-0.5 w-8 flex-shrink-0 mx-0.5 mt-[-16px]',
                  i < stages.findIndex((s) => s.status === 'CURRENT' || s.status === 'BLOCKED') ||
                  (stage.status === 'COMPLETED' && stages[i + 1]?.status !== 'UPCOMING')
                    ? 'bg-green-400'
                    : 'bg-gray-200',
                ].join(' ')}
                style={showLabels ? { marginTop: '-24px' } : {}}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
