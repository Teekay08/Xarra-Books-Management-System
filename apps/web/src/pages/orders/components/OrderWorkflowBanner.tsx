import { Link } from 'react-router';
import { ORDER_MANAGEMENT_STAGES } from '@xarra/shared';

type StageKey = (typeof ORDER_MANAGEMENT_STAGES)[number]['key'];

const STAGE_STATUS_MAP: Record<string, StageKey> = {
  RECEIVED:   'INTAKE',
  SUBMITTED:  'INTAKE',
  DRAFT:      'INTAKE',
  CONFIRMED:  'PROCESSING',
  PROCESSING: 'PROCESSING',
  DISPATCHED: 'DISPATCH',
  BACK_ORDER: 'INTAKE',
  DELIVERED:  'DELIVERY',
  CANCELLED:  'INTAKE',
};

interface OrderWorkflowBannerProps {
  orderId: string;
  orderNumber?: string;
  status: string;
  currentPipelineStep?: number;
  blockers?: string[];
}

const STAGE_ORDER = ORDER_MANAGEMENT_STAGES.map(s => s.key);

export function OrderWorkflowBanner({ orderId, orderNumber, status, currentPipelineStep = 0, blockers }: OrderWorkflowBannerProps) {
  const currentStageKey = STAGE_STATUS_MAP[status] ?? 'INTAKE';
  const currentIdx = STAGE_ORDER.indexOf(currentStageKey);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <Link to={`/orders/${orderId}`} className="text-sm font-medium text-gray-600 hover:text-[#8B1A1A]">
          ← {orderNumber ?? 'Order'}
        </Link>
        <span className="text-xs text-gray-400">Stage {currentIdx + 1}/{ORDER_MANAGEMENT_STAGES.length}</span>
      </div>

      {/* Stage stepper */}
      <div className="flex items-center gap-0">
        {ORDER_MANAGEMENT_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isUpcoming = idx > currentIdx;

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              {/* Node */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                  isCompleted
                    ? 'bg-green-500 border-green-500 text-white'
                    : isCurrent
                    ? 'bg-[#8B1A1A] border-[#8B1A1A] text-white ring-2 ring-[#8B1A1A] ring-offset-1'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span className={`text-xs mt-1 text-center leading-tight max-w-[60px] ${
                  isCurrent ? 'text-[#8B1A1A] font-semibold' : isCompleted ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {stage.name}
                </span>
              </div>

              {/* Connector */}
              {idx < ORDER_MANAGEMENT_STAGES.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Blockers */}
      {blockers && blockers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {blockers.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-50 text-yellow-800 text-xs rounded-full border border-yellow-200">
              ⚠ {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
