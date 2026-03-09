const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const hasBody = init?.body != null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData || !hasBody ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      // Session expired — redirect to login
      window.location.href = '/login';
      throw new ApiError(401, 'Session expired');
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || body.error || res.statusText);
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
