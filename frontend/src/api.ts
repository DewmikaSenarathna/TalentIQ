// VITE_API_URL is set in Vercel to your Render backend URL (no trailing slash).
const BASE = (import.meta.env.VITE_API_URL as string) || "";
export const getToken = () => localStorage.getItem("tiq_token");

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: "Bearer " + getToken() };
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + "/api" + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") { localStorage.removeItem("tiq_token"); location.reload(); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
