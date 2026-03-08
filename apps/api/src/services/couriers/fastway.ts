/**
 * Fastway Courier Integration Adapter
 *
 * Fastway (now Aramex South Africa) API integration for:
 * - Creating shipments and generating waybills
 * - Tracking shipment status
 * - Getting delivery proof
 * - Calculating shipping quotes
 *
 * API Docs: https://www.fastway.co.za/integration
 * This adapter is designed to be plugged in once API credentials are available.
 */

import { config } from '../../config.js';

interface FastwayConfig {
  apiKey: string;
  baseUrl: string;
  accountNumber: string;
}

interface FastwayAddress {
  name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email?: string;
}

interface CreateShipmentRequest {
  sender: FastwayAddress;
  recipient: FastwayAddress;
  parcels: Array<{
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    reference?: string;
  }>;
  serviceType?: 'ECONOMY' | 'EXPRESS' | 'OVERNIGHT';
  reference: string; // our internal reference (order/consignment number)
}

interface CreateShipmentResponse {
  waybillNumber: string;
  trackingUrl: string;
  labelUrl: string; // URL to download the shipping label PDF
  estimatedDelivery: string;
  cost: number;
}

interface TrackingEvent {
  timestamp: string;
  status: string;
  location: string;
  description: string;
}

interface TrackingResponse {
  waybillNumber: string;
  status: 'CREATED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
  events: TrackingEvent[];
  deliveredAt?: string;
  signedBy?: string;
  proofOfDeliveryUrl?: string;
}

interface QuoteRequest {
  fromPostalCode: string;
  toPostalCode: string;
  parcels: Array<{ weightKg: number }>;
}

interface QuoteResponse {
  serviceType: string;
  price: number;
  estimatedDays: number;
}

function getFastwayConfig(): FastwayConfig | null {
  const apiKey = (config as any).fastway?.apiKey;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (config as any).fastway?.baseUrl || 'https://api.fastway.co.za/v3',
    accountNumber: (config as any).fastway?.accountNumber || '',
  };
}

export function isFastwayConfigured(): boolean {
  return getFastwayConfig() !== null;
}

async function fastwayRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const cfg = getFastwayConfig();
  if (!cfg) throw new Error('Fastway is not configured. Set FASTWAY_API_KEY in environment.');

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
      'X-Account': cfg.accountNumber,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fastway API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Create a shipment with Fastway and get a waybill number + label.
 */
export async function createFastwayShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
  return fastwayRequest('/shipments', {
    method: 'POST',
    body: JSON.stringify({
      sender: request.sender,
      recipient: request.recipient,
      parcels: request.parcels,
      service_type: request.serviceType || 'ECONOMY',
      reference: request.reference,
    }),
  });
}

/**
 * Track a shipment by waybill number.
 */
export async function trackFastwayShipment(waybillNumber: string): Promise<TrackingResponse> {
  return fastwayRequest(`/tracking/${encodeURIComponent(waybillNumber)}`);
}

/**
 * Get a shipping quote.
 */
export async function getFastwayQuote(request: QuoteRequest): Promise<QuoteResponse[]> {
  const params = new URLSearchParams({
    from: request.fromPostalCode,
    to: request.toPostalCode,
    weight: String(request.parcels.reduce((sum, p) => sum + p.weightKg, 0)),
  });
  return fastwayRequest(`/quotes?${params}`);
}

/**
 * Download shipping label PDF for a waybill.
 */
export async function getFastwayLabel(waybillNumber: string): Promise<Buffer> {
  const cfg = getFastwayConfig();
  if (!cfg) throw new Error('Fastway is not configured.');

  const res = await fetch(`${cfg.baseUrl}/labels/${encodeURIComponent(waybillNumber)}`, {
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Accept': 'application/pdf',
    },
  });

  if (!res.ok) throw new Error(`Failed to get label: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
