import { ApiError } from "./apiError";
import { demoApi } from "./demo/demoApi";
import type { Conversation, ConversationListItem, Dashboard, Health, Kpi, Summary, TranslatePreview, Validation } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export { ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* body was not JSON */
    }
    if (detail && typeof detail === "object" && "validation" in detail) {
      const d = detail as { message: string; validation: Validation };
      throw new ApiError(d.message, res.status, d.validation);
    }
    throw new ApiError(typeof detail === "string" ? detail : `요청 실패 (${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const realApi = {
  health: () => request<Health>("/api/health"),
  kpi: () => request<Kpi>("/api/kpi"),
  dashboard: (days = 14) => request<Dashboard>(`/api/dashboard?days=${days}`),
  kb: () => request<{ id: string; category: string; title: string; section: string; text: string; text_ko: string }[]>("/api/kb"),
  glossary: () => request<Record<string, string>>("/api/glossary"),
  list: () => request<ConversationListItem[]>("/api/conversations"),
  get: (id: number) => request<Conversation>(`/api/conversations/${id}`),
  create: (body: { channel: string; customer_name: string; customer_email?: string; subject?: string; message: string }) =>
    post<Conversation>("/api/conversations", body),
  customerMessage: (id: number, text: string) => post<Conversation>(`/api/conversations/${id}/customer-messages`, { text }),
  translate: (id: number, text_ko: string) => post<TranslatePreview>(`/api/conversations/${id}/translate`, { text_ko }),
  send: (id: number, body: { text: string; text_ko?: string | null; draft_style?: string | null; draft_text?: string | null }) =>
    post<Conversation>(`/api/conversations/${id}/agent-messages`, body),
  rejectDraft: (id: number, draft_style: string) => post<void>(`/api/conversations/${id}/reject-draft`, { draft_style }),
  summary: (id: number) => post<Summary>(`/api/conversations/${id}/summary`),
  setStatus: (id: number, status: string) => post<ConversationListItem>(`/api/conversations/${id}/status`, { status }),
};

export type Api = typeof realApi;

/** Static demo build (GitHub Pages): same interface, served from a snapshot in the browser. */
export const api: Api = process.env.NEXT_PUBLIC_DEMO === "1" ? demoApi : realApi;
