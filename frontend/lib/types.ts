export type Channel = "chat" | "email";
export type Level = "error" | "warning";

export interface Finding {
  code: string;
  level: Level;
  message: string;
}

export interface Validation {
  passed: boolean;
  findings: Finding[];
}

export interface Source {
  id: string;
  doc_id: string;
  category: string;
  title: string;
  section: string;
  text: string;
  text_ko: string;
  score: number;
}

export interface Draft {
  style: "empathetic" | "concise" | "step_by_step";
  reply: string;
  reply_ko: string;
  source_ids: string[];
  validation: Validation;
}

export interface Classification {
  language: string;
  translation_ko: string;
  intent_ko: string;
  category: string;
  sentiment: "calm" | "frustrated" | "angry";
  urgency: "low" | "medium" | "high";
  search_query: string;
  pii_masked: string[];
}

export interface Analysis {
  classification?: Classification;
  sources?: Source[];
  drafts?: Draft[];
  timings_ms?: Record<string, number>;
  validation?: Validation;
}

export interface Message {
  id: number;
  role: "customer" | "agent";
  text: string;
  text_ko: string | null;
  analysis: Analysis | null;
  created_at: string;
}

export interface Summary {
  summary_ko: string;
  issue_ko: string;
  actions_ko: string[];
  next_action_ko: string;
  category: string;
  resolved: boolean;
  escalate: boolean;
  escalate_reason_ko: string;
  tags: string[];
}

export interface ConversationListItem {
  id: number;
  channel: Channel;
  customer_name: string;
  customer_email: string | null;
  subject: string | null;
  language: string;
  category: string | null;
  sentiment: string | null;
  urgency: "low" | "medium" | "high" | null;
  status: "open" | "resolved" | "escalated";
  updated_at: string;
  preview: string;
  awaiting_reply: boolean;
}

export interface Conversation extends ConversationListItem {
  messages: Message[];
  summary: Summary | null;
}

export interface TranslatePreview {
  reply: string;
  back_translation_ko: string;
  validation: Validation;
}

export interface Kpi {
  conversations: number;
  by_status: Record<string, number>;
  agent_replies: number;
  draft_adoption_rate: number | null;
  accepted_as_is: number;
  edited: number;
  rejected: number;
  avg_edit_ratio: number | null;
  avg_first_draft_ms: number | null;
  drafts_generated: number;
  drafts_blocked_by_guard: number;
}

export interface Health {
  status: string;
  llm_provider: string;
  kb_chunks: number;
}

export interface DashboardDay {
  date: string;
  chat: number;
  email: number;
  inquiries: number;
  replies: number;
  from_draft: number;
  drafts: number;
  blocked: number;
  adoption_rate: number | null;
}

export interface Dashboard {
  days: number;
  timezone: string;
  daily: DashboardDay[];
  totals: {
    inquiries: number;
    week: number;
    week_prev: number;
    week_delta: number | null;
    replies: number;
    adoption_rate: number | null;
    avg_first_draft_ms: number | null;
    drafts: number;
    blocked: number;
    open_waiting: number;
    high_waiting: number;
  };
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  guard_findings: Record<string, number>;
  queue: { id: number; customer_name: string; channel: Channel; category: string | null; urgency: string | null; sentiment: string | null; preview: string; waiting_minutes: number }[];
  recent: { conversation_id: number; customer_name: string; channel: Channel; role: "customer" | "agent"; category: string | null; at: string; text: string }[];
}
