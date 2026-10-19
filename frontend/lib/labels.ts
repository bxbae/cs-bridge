export const CATEGORY_KO: Record<string, string> = {
  billing: "결제·미지급",
  refund: "환불",
  account: "계정·정지",
  technical: "접속·기술",
  maintenance: "점검·패치",
  bug: "버그",
  other: "기타",
};

export const SENTIMENT_KO: Record<string, string> = { calm: "차분", frustrated: "답답함", angry: "화남" };
export const URGENCY_KO: Record<string, string> = { low: "낮음", medium: "보통", high: "높음" };
export const STYLE_KO: Record<string, string> = { empathetic: "공감형", concise: "간결형", step_by_step: "단계형" };
export const STATUS_KO: Record<string, string> = { open: "진행 중", resolved: "해결", escalated: "이관" };
export const CHANNEL_KO: Record<string, string> = { chat: "채팅", email: "이메일" };

export const URGENCY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

export function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function longDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

export function pct(v: number | null | undefined, digits = 0) {
  return v == null ? "–" : `${(v * 100).toFixed(digits)}%`;
}
