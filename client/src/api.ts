const TOKEN_KEY = "vistora.token";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: string[]) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.set(null);
      window.dispatchEvent(new Event("vistora:logout"));
    }
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code, data.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: Body) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: Body) => request<T>("PATCH", url, body),
  del: <T = void>(url: string) => request<T>("DELETE", url),
};

export const errorMessage = (err: unknown) => {
  if (err instanceof ApiError) return err.details?.length ? `${err.message}: ${err.details.join("; ")}` : err.message;
  return err instanceof Error ? err.message : "Something went wrong";
};
