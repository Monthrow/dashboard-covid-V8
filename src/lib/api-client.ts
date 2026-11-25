// Calls the PHP Native API running on XAMPP (folder api/ copied to htdocs).
// Change the address with VITE_API_BASE_URL in .env (default: http://localhost/dashboard-covid/api).

export const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/+$/, "") || "http://localhost/dashboard-covid/api";

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

const OFFLINE =
  `Server PHP/MySQL tidak dapat dihubungi di ${API_BASE_URL}. Pastikan Apache dan MySQL di XAMPP sudah Start, folder api ada di htdocs, dan database db_covid_indonesia sudah diimpor.`;

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    const req: RequestInit = { method: init?.method ?? (init?.body ? "POST" : "GET") };
    if (init?.body) { req.headers = { "Content-Type": "application/json" }; req.body = JSON.stringify(init.body); }
    if (init?.signal) req.signal = init.signal;
    res = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`, req);
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  let json: { ok?: boolean; data?: T; error?: string; errors?: unknown } | null = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || !json?.ok) {
    throw new ApiError(json?.error ?? `Server mengembalikan status ${res.status}.`, res.status, json?.errors);
  }
  return json.data as T;
}
