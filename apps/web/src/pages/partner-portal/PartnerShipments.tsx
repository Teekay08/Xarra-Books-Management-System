import { useEffect, useState } from 'react';
import { partnerApi } from '../../lib/partner-api';

interface Shipment {
  id: string;
  waybillNumber: string;
  courierCompany: string;
  status: string;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  deliverySignedBy: string | null;
  trackingUrl: string | null;
  partnerOrderId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-800',
  PICKED_UP: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Created',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PartnerShipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShipments() {
      setLoading(true);
      try {
        const res = await partnerApi<{ data: Shipment[] }>('/shipments');
        setShipments(res.data);
      } catch {
        // errors handled by partnerApi (401 redirect, etc.)
      } finally {
        setLoading(false);
      }
    }
    fetchShipments();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shipment Tracking</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track all shipments for your orders.
        </p>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            No shipments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-6 py-3 font-medium">Waybill #</th>
                  <th className="px-6 py-3 font-medium">Order #</th>
                  <th className="px-6 py-3 font-medium">Courier</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Est. Delivery</th>
                  <th className="px-6 py-3 font-medium">Actual Delivery</th>
                  <th className="px-6 py-3 font-medium">Signed By</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => (
                  <tr
                    key={shipment.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-6 py-3">
                      <span className="font-medium text-gray-900">
                        {shipment.waybillNumber}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {shipment.partnerOrderId ? 'Linked' : '-'}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {shipment.courierCompany}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[shipment.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {STATUS_LABELS[shipment.status] ?? shipment.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {formatDate(shipment.estimatedDelivery)}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {formatDate(shipment.deliveredAt)}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {shipment.deliverySignedBy ?? '-'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {shipment.trackingUrl ? (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Track
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
