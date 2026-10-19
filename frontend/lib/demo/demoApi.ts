/**
 * In-browser stand-in for the FastAPI backend, used by the static demo build (GitHub Pages).
 *
 * Data comes from public/demo/snapshot.json, exported from the real backend by
 * backend/scripts/export_demo.py. Behavior that reacts to what the visitor types runs here:
 *   - validation guards: lib/demo/guards.ts, checked identical to the Python (npm run demo:parity)
 *   - translation preview and case summary: ports of the offline mock provider
 *   - new inquiries: cached pipeline results for the preset / eval messages
 * State lives in memory, so a reload restores the snapshot.
 */
import { ApiError } from "../apiError";
import type { Conversation, ConversationListItem, Dashboard, Health, Kpi, Message, Source, Summary, TranslatePreview } from "../types";
import { checkReply, sortedGlossary, termsIn, type KbChunk } from "./guards";

type KbItem = KbChunk & { category: string; title: string; section: string; text_ko: string };
interface Snapshot {
  generated_at: string;
  health: Health;
  conversations: Conversation[];
  dashboards: Record<string, Dashboard>;
  kb: KbItem[];
  glossary: Record<string, string>;
  translate_fixtures: Record<string, string>;
  settings: { agent_name: string; brand_name: string };
  feedback: { conversation_id: number; action: string; edit_ratio: number | null; draft_style: string | null }[];
  pipeline_cache: Record<string, { text_ko: string; analysis: Message["analysis"] }>;
}
interface State { snap: Snapshot; convs: Conversation[]; feedback: Snapshot["feedback"]; nextConv: number; nextMsg: number }

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const NAME = "__NAME__";
let statePromise: Promise<State> | null = null;

function load(): Promise<State> {
  statePromise ??= fetch(`${BASE_PATH}/demo/snapshot.json`)
    .then((r) => {
      if (!r.ok) throw new ApiError("데모 데이터를 불러오지 못했습니다.", r.status);
      return r.json() as Promise<Snapshot>;
    })
    .then((snap) => {
      const convs = structuredClone(snap.conversations);
      const ids = convs.flatMap((c) => [c.id, ...c.messages.map((m) => m.id)]);
      return { snap, convs, feedback: [...snap.feedback], nextConv: Math.max(0, ...convs.map((c) => c.id)) + 1, nextMsg: Math.max(0, ...ids) + 1 };
    });
  return statePromise;
}

const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
const firstName = (name: string) => (name || "there").split(" ")[0];
const URGENCY = ["low", "medium", "high"] as const;

function find(s: State, id: number): Conversation {
  const conv = s.convs.find((c) => c.id === id);
  if (!conv) throw new ApiError("conversation not found", 404);
  return conv;
}

function listItem(c: Conversation): ConversationListItem {
  const last = c.messages.at(-1);
  const { messages: _m, summary: _s, ...rest } = c;
  return { ...rest, preview: last ? (last.text_ko || last.text).slice(0, 80) : "", awaiting_reply: last?.role === "customer" };
}

function latestSources(c: Conversation): Source[] {
  for (const m of [...c.messages].reverse()) if (m.role === "customer" && m.analysis) return m.analysis.sources ?? [];
  return [];
}

/** 1 - similarity, similarity = 2*LCS/(|a|+|b|): close to difflib's ratio for short replies. */
function editRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return Math.round((1 - (2 * prev[b.length]) / (a.length + b.length)) * 1000) / 1000;
}

function cachedAnalysis(s: State, channel: string, text: string, customer: string) {
  const hit = s.snap.pipeline_cache[`${channel}|${text.trim()}`];
  if (!hit) {
    throw new ApiError(
      "정적 데모에서는 미리 분석해 둔 문의만 접수할 수 있어요. 위의 프리셋 버튼을 눌러 보세요. (모든 문장 분석은 로컬 실행 시 가능합니다)",
      400,
    );
  }
  return JSON.parse(JSON.stringify(hit).split(NAME).join(firstName(customer))) as typeof hit;
}

function addCustomerMessage(s: State, conv: Conversation, text: string) {
  const hit = cachedAnalysis(s, conv.channel, text, conv.customer_name);
  const cls = hit.analysis!.classification!;
  conv.messages.push({ id: s.nextMsg++, role: "customer", text, text_ko: hit.text_ko, analysis: hit.analysis, created_at: now() });
  conv.language = cls.language;
  conv.category = cls.category;
  conv.sentiment = cls.sentiment;
  if (!conv.urgency || URGENCY.indexOf(cls.urgency) > URGENCY.indexOf(conv.urgency)) conv.urgency = cls.urgency;
  conv.status = "open";
  conv.updated_at = now();
}

export const demoApi = {
  health: async (): Promise<Health> => clone((await load()).snap.health),

  kpi: async (): Promise<Kpi> => {
    const s = await load();
    const count = (a: string) => s.feedback.filter((f) => f.action === a).length;
    const fromDrafts = count("accepted") + count("edited");
    const replies = fromDrafts + count("manual");
    const ratios = s.feedback.map((f) => f.edit_ratio).filter((r): r is number => r != null);
    const customer = s.convs.flatMap((c) => c.messages.filter((m) => m.role === "customer" && m.analysis));
    const latencies = customer.map((m) => m.analysis!.timings_ms?.total).filter((v): v is number => v != null);
    const drafts = customer.flatMap((m) => m.analysis!.drafts ?? []);
    const tally = (key: (c: Conversation) => string) =>
      s.convs.reduce<Record<string, number>>((acc, c) => ({ ...acc, [key(c)]: (acc[key(c)] ?? 0) + 1 }), {});
    return {
      conversations: s.convs.length,
      by_status: tally((c) => c.status),
      agent_replies: replies,
      draft_adoption_rate: replies ? Math.round((fromDrafts / replies) * 1000) / 1000 : null,
      accepted_as_is: count("accepted"),
      edited: count("edited"),
      rejected: count("rejected"),
      avg_edit_ratio: ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 1000 : null,
      avg_first_draft_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      drafts_generated: drafts.length,
      drafts_blocked_by_guard: drafts.filter((d) => !d.validation.passed).length,
    };
  },

  dashboard: async (days = 14): Promise<Dashboard> => {
    const s = await load();
    return clone(s.snap.dashboards[String(days)] ?? s.snap.dashboards["14"]);
  },

  kb: async () => clone((await load()).snap.kb),
  glossary: async () => clone((await load()).snap.glossary),

  list: async (): Promise<ConversationListItem[]> => {
    const s = await load();
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...s.convs]
      .sort((a, b) => {
        const ka = [a.status !== "open" ? 1 : 0, a.messages.at(-1)?.role === "customer" ? 0 : 1, rank[a.urgency ?? ""] ?? 3, -Date.parse(a.updated_at)];
        const kb = [b.status !== "open" ? 1 : 0, b.messages.at(-1)?.role === "customer" ? 0 : 1, rank[b.urgency ?? ""] ?? 3, -Date.parse(b.updated_at)];
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return 0;
      })
      .map(listItem);
  },

  get: async (id: number): Promise<Conversation> => clone(find(await load(), id)),

  create: async (body: { channel: string; customer_name: string; customer_email?: string; subject?: string; message: string }): Promise<Conversation> => {
    const s = await load();
    cachedAnalysis(s, body.channel, body.message, body.customer_name); // validate before creating anything
    const conv: Conversation = {
      id: s.nextConv++, channel: body.channel as Conversation["channel"], customer_name: body.customer_name,
      customer_email: body.customer_email ?? null, subject: body.subject ?? null, language: "en", category: null,
      sentiment: null, urgency: null, status: "open", updated_at: now(), preview: "", awaiting_reply: true, messages: [], summary: null,
    };
    addCustomerMessage(s, conv, body.message);
    s.convs.push(conv);
    return clone(conv);
  },

  customerMessage: async (id: number, text: string): Promise<Conversation> => {
    const s = await load();
    const conv = find(s, id);
    addCustomerMessage(s, conv, text);
    return clone(conv);
  },

  translate: async (id: number, text_ko: string): Promise<TranslatePreview> => {
    const s = await load();
    const conv = find(s, id);
    const ko = text_ko.trim();
    let body = s.snap.translate_fixtures[ko];
    if (!body) {
      body = ko;
      for (const [k, en] of sortedGlossary(Object.fromEntries(termsIn(ko, s.snap.glossary)))) body = body.split(k).join(en);
      body = `[mock translation] ${body}`;
    }
    if (conv.channel === "email" && !/^\s*(hi|hello|dear)\b/i.test(body)) {
      body = `Hi ${firstName(conv.customer_name)},\n\n${body}\n\nBest regards,\n${s.snap.settings.agent_name}\n${s.snap.settings.brand_name}`;
    }
    return {
      reply: body,
      back_translation_ko: ko,
      validation: checkReply(body, conv.channel, latestSources(conv), s.snap.kb, s.snap.glossary, null, ko),
    };
  },

  send: async (id: number, b: { text: string; text_ko?: string | null; draft_style?: string | null; draft_text?: string | null }): Promise<Conversation> => {
    const s = await load();
    const conv = find(s, id);
    const validation = checkReply(b.text, conv.channel, latestSources(conv), s.snap.kb, s.snap.glossary);
    if (!validation.passed) throw new ApiError("검증을 통과하지 못해 보낼 수 없습니다.", 422, validation);
    conv.messages.push({ id: s.nextMsg++, role: "agent", text: b.text, text_ko: b.text_ko ?? null, analysis: { validation }, created_at: now() });
    if (b.draft_text) {
      const ratio = editRatio(b.draft_text, b.text);
      s.feedback.push({ conversation_id: id, action: ratio < 0.05 ? "accepted" : "edited", edit_ratio: ratio, draft_style: b.draft_style ?? null });
    } else {
      s.feedback.push({ conversation_id: id, action: "manual", edit_ratio: null, draft_style: null });
    }
    conv.updated_at = now();
    return clone(conv);
  },

  rejectDraft: async (id: number, draft_style: string): Promise<void> => {
    const s = await load();
    find(s, id);
    s.feedback.push({ conversation_id: id, action: "rejected", edit_ratio: null, draft_style });
  },

  summary: async (id: number): Promise<Summary> => {
    const s = await load();
    const conv = find(s, id);
    const msgs = conv.messages;
    const agent = msgs.filter((m) => m.role === "agent");
    const first = msgs.find((m) => m.role === "customer");
    const category = conv.category ?? "other";
    const escalate = ["refund", "account"].includes(category) && agent.length > 0;
    const summary: Summary = {
      summary_ko: `[mock 요약] ${category} 문의. 고객 메시지 ${msgs.length - agent.length}건, 상담원 답변 ${agent.length}건.`,
      issue_ko: (first?.text_ko || first?.text || "").slice(0, 160),
      actions_ko: agent.map((m) => (m.text_ko || m.text).slice(0, 120)),
      next_action_ko: agent.length ? "없음" : "상담원 답변 필요",
      category,
      resolved: agent.length > 0,
      escalate,
      escalate_reason_ko: escalate ? "결제 리드·보안팀 확인이 필요한 유형" : "",
      tags: [category, "mock"],
    };
    conv.summary = summary;
    conv.status = summary.escalate ? "escalated" : summary.resolved ? "resolved" : conv.status;
    conv.updated_at = now();
    return clone(summary);
  },

  setStatus: async (id: number, status: string): Promise<ConversationListItem> => {
    const s = await load();
    const conv = find(s, id);
    conv.status = status as Conversation["status"];
    conv.updated_at = now();
    return listItem(conv);
  },
};

export async function demoSnapshotDate(): Promise<string> {
  return (await load()).snap.generated_at;
}
