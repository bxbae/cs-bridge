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

export const FINDING_KO: Record<string, string> = {
  unsupported_promise: "근거 없는 약속",
  prohibited_promise: "불가 항목 약속",
  conditional_policy: "조건부 정책",
  number_mismatch: "숫자 불일치",
  pii: "개인정보 포함",
  ungrounded_citation: "근거 없는 인용",
  glossary: "용어집 미준수",
  absolute_wording: "단정적 표현",
  email_greeting: "이메일 인사말",
  email_signoff: "이메일 맺음말",
  chat_length: "채팅 길이",
};

export function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function longDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

export function waitingLabel(min: number) {
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 대기`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 대기`;
  return `${Math.floor(min / 1440)}일 대기`;
}

export function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "늦은 밤이에요" : h < 12 ? "좋은 아침이에요" : h < 18 ? "좋은 오후예요" : "좋은 저녁이에요";
  return `${part}, ${name} 님!`;
}

export function pct(v: number | null | undefined, digits = 0) {
  return v == null ? "–" : `${(v * 100).toFixed(digits)}%`;
}
