/**
 * Browser port of backend/app/pipeline/{pii,glossary,validate}.py for the static demo.
 * Must stay behavior-identical to the Python: `npm run demo:parity` compares both on the
 * cases exported by backend/scripts/export_demo.py. No imports, so Node can run it directly.
 */

export type Level = "error" | "warning";
export interface Finding { code: string; level: Level; message: string }
export interface Validation { passed: boolean; findings: Finding[] }
export interface SourceLike { id: string; doc_id?: string; text: string }
export interface KbChunk { id: string; doc_id: string; text: string }

/* ---------- pii.py ---------- */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /(?<![\w.])(?:\d[ -]?){12,18}\d(?!\w)/g;
const PHONE = /(?<![\w.-])(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)|\d{2,4})[ -]\d{3,4}[ -]\d{4}(?![\w-])/g;
const SUPPORT_DOMAINS = ["starfall-odyssey.com"];

function luhnOk(digits: string): boolean {
  let total = 0;
  [...digits].reverse().forEach((ch, i) => {
    let n = Number(ch);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    total += n;
  });
  return total % 10 === 0;
}

export function findPii(text: string): { type: string; span: [number, number] }[] {
  const found: { type: string; span: [number, number] }[] = [];
  for (const m of text.matchAll(EMAIL)) {
    if (!SUPPORT_DOMAINS.some((d) => m[0].toLowerCase().endsWith(d))) found.push({ type: "email", span: [m.index!, m.index! + m[0].length] });
  }
  for (const m of text.matchAll(CARD)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) found.push({ type: "card", span: [m.index!, m.index! + m[0].length] });
  }
  for (const m of text.matchAll(PHONE)) {
    if (!found.some((f) => f.span[0] <= m.index! && m.index! < f.span[1])) found.push({ type: "phone", span: [m.index!, m.index! + m[0].length] });
  }
  return found.sort((a, b) => a.span[0] - b.span[0]);
}

/* ---------- glossary.py ---------- */

export function sortedGlossary(glossary: Record<string, string>): [string, string][] {
  return Object.entries(glossary).sort((a, b) => b[0].length - a[0].length);
}

export function termsIn(textKo: string, glossary: Record<string, string>): [string, string][] {
  let remaining = textKo;
  const hits: [string, string][] = [];
  for (const [ko, en] of sortedGlossary(glossary)) {
    if (remaining.includes(ko)) {
      hits.push([ko, en]);
      remaining = remaining.split(ko).join(" ");
    }
  }
  return hits;
}

function missingTerms(textKo: string, textEn: string, glossary: Record<string, string>) {
  const lower = textEn.toLowerCase();
  return termsIn(textKo, glossary).filter(([, en]) => !lower.includes(en.toLowerCase())).map(([ko, en]) => ({ ko, en }));
}

/* ---------- validate.py ---------- */

const PROMISE = /\b(we(?:'ll| will)|i(?:'ll| will)|you(?:'ll| will) (?:receive|get)|we(?:'ve| have) (?:refunded|sent|added|restored|delivered|lifted)|we are (?:sending|refunding)|(?:are|is) (?:going to be )?(?:refunded|restored|compensated))\b/i;
const PROMISE_OBJECT = /\b(refund\w*|compensat\w*|crystals?|restor\w*|reimburs\w*|free|lift\w*|unban\w*|deliver\w*)\b/gi;
const ABSOLUTE = /\b(guarantee\w*|definitely|100%|immediately lift|right away|for sure)\b/gi;
const PROHIBITION = /\b(cannot|can't|must not|do not promise|never)\b/i;
const RESTRICTION = /\b(cannot|can't|not|only if|only given|must not|unless|require\w*)\b/i;
const NUMBER = /\d+(?:[.,:]\d+)*/g;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER)].map((m) => m[0].replace(/,/g, "")));
}

const NUMBER_WORDS: Record<string, string> = Object.fromEntries(
  "zero one two three four five six seven eight nine ten eleven twelve".split(" ").map((w, i) => [w, String(i)]),
);
const NUMBER_WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

/** Digits plus English number words, so "two-step" counts as 2. */
function translatedNumbers(text: string): Set<string> {
  const out = numbersIn(text);
  for (const m of text.matchAll(NUMBER_WORD)) out.add(NUMBER_WORDS[m[1].toLowerCase()]);
  return out;
}

/** Digits the translation must keep: those inside glossary terms (2단계 인증) are not quantities. */
function sourceNumbersKo(textKo: string, glossary: Record<string, string>): Set<string> {
  let t = textKo;
  for (const [ko] of termsIn(textKo, glossary)) t = t.split(ko).join(" ");
  return numbersIn(t);
}

const sortedList = (s: Iterable<string>) => [...s].sort();

export function checkReply(
  reply: string,
  channel: string,
  sources: SourceLike[],
  kb: KbChunk[],
  glossary: Record<string, string>,
  citedIds: string[] | null = null,
  sourceKo: string | null = null,
): Validation {
  const findings: Finding[] = [];
  const docIds = new Set(sources.map((s) => s.doc_id || s.id.split("#")[0]));
  const siblings = kb.filter((c) => docIds.has(c.doc_id)).map((c) => c.text);
  const sourceText = [...sources.map((s) => s.text), ...siblings].join(" ");
  const sourceLower = sourceText.toLowerCase();
  const sourceNumbers = numbersIn(sourceText);
  const retrievedIds = new Set(sources.map((s) => s.id));

  for (const item of findPii(reply)) {
    findings.push({ code: "pii", level: "error", message: `답변에 개인정보(${item.type})가 포함되어 있습니다.` });
  }

  for (const sentence of sentences(reply)) {
    const objectMatches = [...sentence.matchAll(PROMISE_OBJECT)].map((m) => m[1]);
    if (!(PROMISE.test(sentence) && objectMatches.length)) continue;
    const objects = new Set(objectMatches.map((m) => m.toLowerCase().slice(0, 6)));
    const groundedObject = [...objects].some((o) => sourceLower.includes(o));
    const unsupported = [...numbersIn(sentence)].filter((n) => !sourceNumbers.has(n));
    if (!sources.length || !groundedObject || unsupported.length) {
      const detail = unsupported.length ? ` (근거 없는 수치: ${sortedList(unsupported).join(", ")})` : "";
      findings.push({ code: "unsupported_promise", level: "error", message: `정책 근거 없는 약속일 수 있습니다${detail}: "${sentence.slice(0, 90)}"` });
      continue;
    }
    const srcSentences = sentences(sourceText);
    const mentions = (s: string) => [...objects].some((o) => s.toLowerCase().includes(o));
    const restricted = srcSentences.filter((s) => RESTRICTION.test(s) && mentions(s));
    const permitted = srcSentences.filter((s) => !RESTRICTION.test(s) && mentions(s));
    if (restricted.length && !permitted.length && restricted.some((s) => PROHIBITION.test(s))) {
      findings.push({ code: "prohibited_promise", level: "error", message: `정책상 상담원이 할 수 없는 약속입니다 — "${restricted[0].slice(0, 90)}"` });
    } else if (restricted.length) {
      findings.push({ code: "conditional_policy", level: "warning", message: `조건이 있는 정책입니다. 고객이 조건을 충족하는지 확인하세요 — "${restricted[0].slice(0, 90)}"` });
    }
  }

  for (const m of reply.matchAll(ABSOLUTE)) {
    findings.push({ code: "absolute_wording", level: "warning", message: `단정적 표현 "${m[0]}" — 처리 기간·결과를 보장하지 않도록 수정하세요.` });
  }

  for (const cid of citedIds ?? []) {
    if (!retrievedIds.has(cid)) findings.push({ code: "ungrounded_citation", level: "error", message: `검색되지 않은 근거 ${cid}를 인용했습니다.` });
  }

  if (sourceKo != null) {
    const replyNumbers = translatedNumbers(reply);
    const lost = [...sourceNumbersKo(sourceKo, glossary)].filter((n) => !replyNumbers.has(n));
    if (lost.length) findings.push({ code: "number_mismatch", level: "error", message: `번역문에서 숫자가 빠지거나 바뀌었습니다: ${sortedList(lost).join(", ")}` });
    for (const t of missingTerms(sourceKo, reply, glossary)) {
      findings.push({ code: "glossary", level: "warning", message: `용어집: '${t.ko}'는 "${t.en}"로 번역해야 합니다.` });
    }
  }

  if (channel === "email") {
    if (!/^\s*(hi|hello|dear)\b/i.test(reply)) findings.push({ code: "email_greeting", level: "warning", message: "이메일 첫 줄에 인사말(Hi/Hello/Dear)이 없습니다." });
    if (!/(regards|sincerely|best|thank you)[,!.]?\s*\n/i.test(reply)) findings.push({ code: "email_signoff", level: "warning", message: "이메일 맺음말과 서명이 없습니다." });
  } else if ([...reply].length > 700) {
    findings.push({ code: "chat_length", level: "warning", message: "채팅 답변이 깁니다(700자 초과). 핵심만 짧게 줄이세요." });
  }

  return { passed: !findings.some((f) => f.level === "error"), findings };
}
