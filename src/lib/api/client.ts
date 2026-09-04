export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any, message?: string) {
    super(message || `API Error: ${status}`);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('razorreach_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('razorreach_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('razorreach_token');
}

interface RequestOptions extends RequestInit {
  data?: any;
  params?: Record<string, string>;
  requireAuth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { data, params, requireAuth = true, ...customConfig } = options;

  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (requireAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...headers,
      ...(customConfig.headers as Record<string, string> || {}),
    },
  };

  if (data !== undefined && data !== null) {
    if (isFormData) {
      config.body = data;
    } else {
      config.body = JSON.stringify(data);
    }
  }

  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  try {
    const response = await fetch(url, config);
    const text = await response.text();
    const responseData = text ? JSON.parse(text) : {};

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        // Option to trigger a global event for redirection to login could be added here
      }
      throw new ApiError(response.status, responseData, responseData.detail || 'API request failed');
    }

    return responseData as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new Error(err.message || 'Network error');
  }
}
