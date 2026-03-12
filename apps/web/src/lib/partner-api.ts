const BASE = '/api/v1/partner-portal';

export class PartnerApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getPartnerToken(): string | null {
  return localStorage.getItem('partner_token');
}

export function setPartnerToken(token: string) {
  localStorage.setItem('partner_token', token);
}

export function clearPartnerToken() {
  localStorage.removeItem('partner_token');
  localStorage.removeItem('partner_user');
}

export function getPartnerUser(): PartnerUser | null {
  const raw = localStorage.getItem('partner_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setPartnerUser(user: PartnerUser) {
  localStorage.setItem('partner_user', JSON.stringify(user));
}

export interface PartnerUser {
  id: string;
  name: string;
  email: string;
  role: string;
  partnerId: string;
  partnerName: string;
  branchId: string | null;
  branchName: string | null;
}

export async function partnerApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getPartnerToken();
  const isFormData = init?.body instanceof FormData;

  const hasBody = init?.body != null;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearPartnerToken();
      window.location.href = '/partner/login';
      throw new PartnerApiError(401, 'Session expired');
    }
    const body = await res.json().catch(() => ({}));
    throw new PartnerApiError(res.status, body.message || body.error || res.statusText);
  }

  return res.json();
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function partnerLogin(email: string, password: string): Promise<PartnerUser> {
  const res = await partnerApi<{ data: { token: string; user: PartnerUser } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  setPartnerToken(res.data.token);
  setPartnerUser(res.data.user);
  return res.data.user;
}

export async function partnerLogout() {
  try {
    await partnerApi('/auth/logout', { method: 'POST' });
  } finally {
    clearPartnerToken();
  }
}
