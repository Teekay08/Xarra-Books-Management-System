interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  changedByUser?: { name: string } | null;
  changedByPartnerUser?: { name: string } | null;
  source: string;
  notes: string | null;
  courierStatus: string | null;
  courierLocation: string | null;
}

interface OrderTimelineProps {
  entries: TimelineEntry[];
}

const statusLabels: Record<string, string> = {
  ORDER_RECEIVED: 'Order Received',
  CONFIRMED: 'Confirmed',
  PICKING: 'Picking Started',
  PACKING: 'Packing Started',
  DISPATCHED: 'Dispatched',
  WITH_COURIER: 'Handed to Courier',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  SUBMITTED: 'Order Submitted',
  PROCESSING: 'Processing',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<string, string> = {
  ORDER_RECEIVED: 'bg-blue-500',
  CONFIRMED: 'bg-blue-600',
  PICKING: 'bg-yellow-500',
  PACKING: 'bg-yellow-600',
  DISPATCHED: 'bg-purple-500',
  WITH_COURIER: 'bg-purple-600',
  IN_TRANSIT: 'bg-indigo-500',
  OUT_FOR_DELIVERY: 'bg-orange-500',
  DELIVERED: 'bg-green-600',
  CANCELLED: 'bg-red-500',
};

export function OrderTimeline({ entries }: OrderTimelineProps) {
  if (!entries.length) {
    return <p className="text-sm text-gray-400 py-4">No status history yet.</p>;
  }

  // Sort newest first
  const sorted = [...entries].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      <div className="space-y-4">
        {sorted.map((entry, idx) => {
          const isFirst = idx === 0;
          const changedBy = entry.changedByUser?.name || entry.changedByPartnerUser?.name || 'System';
          const dotColor = statusColors[entry.toStatus] || 'bg-gray-400';

          return (
            <div key={entry.id} className="relative flex gap-4 pl-2">
              {/* Dot */}
              <div className={`relative z-10 mt-1.5 w-5 h-5 rounded-full border-2 border-white shadow-sm flex-shrink-0 ${dotColor} ${isFirst ? 'ring-2 ring-green-200' : ''}`} />

              {/* Content */}
              <div className={`flex-1 pb-4 ${isFirst ? '' : 'opacity-80'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">
                    {statusLabels[entry.toStatus] || entry.toStatus.replace(/_/g, ' ')}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    entry.source === 'MANUAL' ? 'bg-gray-100 text-gray-600' :
                    entry.source === 'COURIER_WEBHOOK' ? 'bg-purple-100 text-purple-700' :
                    entry.source === 'PARTNER_PORTAL' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {entry.source.replace(/_/g, ' ')}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(entry.changedAt).toLocaleDateString('en-ZA', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}{' '}
                  {new Date(entry.changedAt).toLocaleTimeString('en-ZA', {
                    hour: '2-digit', minute: '2-digit',
                  })}{' '}
                  &middot; {changedBy}
                </p>

                {entry.courierLocation && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Location: {entry.courierLocation}
                  </p>
                )}

                {entry.notes && (
                  <p className="text-xs text-gray-600 mt-1 italic">{entry.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
