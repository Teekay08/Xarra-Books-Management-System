const STEPS = [
  { key: 'ORDER_RECEIVED', label: 'Order Received', icon: '1' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: '2' },
  { key: 'PICKING', label: 'Picking', icon: '3' },
  { key: 'PACKING', label: 'Packing', icon: '4' },
  { key: 'DISPATCHED', label: 'Dispatched', icon: '5' },
  { key: 'WITH_COURIER', label: 'With Courier', icon: '6' },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: '7' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: '8' },
  { key: 'DELIVERED', label: 'Delivered', icon: '9' },
];

interface CompletedStep {
  step: string;
  completedAt: string;
}

interface OrderTrackingPipelineProps {
  currentStep: number; // 0-based index into STEPS
  completedSteps?: CompletedStep[];
  compact?: boolean;
}

export function OrderTrackingPipeline({ currentStep, completedSteps = [], compact = false }: OrderTrackingPipelineProps) {
  const completedMap = new Map(completedSteps.map((s) => [s.step, s.completedAt]));

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className={`flex items-start ${compact ? 'gap-1' : 'gap-0'} min-w-[700px]`}>
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isPending = idx > currentStep;
          const completedAt = completedMap.get(step.key);

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {idx > 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                    isCompleted || isCurrent ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                  style={{ zIndex: 0 }}
                />
              )}

              {/* Circle */}
              <div
                className={`relative z-10 flex items-center justify-center rounded-full font-bold text-xs
                  ${compact ? 'w-7 h-7' : 'w-9 h-9'}
                  ${isCompleted ? 'bg-green-600 text-white' : ''}
                  ${isCurrent ? 'bg-green-600 text-white ring-4 ring-green-100' : ''}
                  ${isPending ? 'bg-gray-200 text-gray-400' : ''}
                `}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>

              {/* Label */}
              <p className={`mt-1.5 text-center leading-tight ${compact ? 'text-[10px]' : 'text-xs'} ${
                isCompleted || isCurrent ? 'text-green-700 font-semibold' : 'text-gray-400'
              }`}>
                {step.label}
              </p>

              {/* Timestamp */}
              {completedAt && !compact && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(completedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
