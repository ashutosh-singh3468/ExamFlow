import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = unknown>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that ExamFlow is running and try again.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('ef:unauthorized'));
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const http = {
  get: <T,>(p: string) => api<T>(p),
  post: <T,>(p: string, body: unknown = {}) => api<T>(p, 'POST', body),
  put: <T,>(p: string, body: unknown = {}) => api<T>(p, 'PUT', body),
  patch: <T,>(p: string, body: unknown = {}) => api<T>(p, 'PATCH', body),
  del: <T,>(p: string) => api<T>(p, 'DELETE'),
};

export function useApi<T>(path: string | null, options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: !!path && (options?.enabled ?? true),
    ...options,
  });
}

/** Mutation that refreshes every cached query afterwards so all screens stay consistent. */
export function useAction<TVars = void, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
