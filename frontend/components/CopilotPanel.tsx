"use client";

import { useState } from "react";
import { CATEGORY_KO, SENTIMENT_KO, STYLE_KO, URGENCY_KO } from "@/lib/labels";
import type { Conversation, Draft, Message, Source } from "@/lib/types";
import { FindingList, ValidationBadge } from "./Findings";

function DraftCard({
  draft,
  onUse,
  onEditKo,
  onReject,
}: {
  draft: Draft;
  onUse: () => void;
  onEditKo: () => void;
  onReject: () => void;
}) {
  const [showKo, setShowKo] = useState(false);
  return (
    <div className="rounded-xl border border-ink-100 bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold">{STYLE_KO[draft.style]}</span>
        <ValidationBadge v={draft.validation} />
        <div className="ml-auto flex gap-1">
          {draft.source_ids.map((id) => (
            <span key={id} className="chip bg-ink-100 font-mono text-[10px] text-ink-700">{id}</span>
          ))}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">{draft.reply}</p>
      {draft.reply_ko && (
        <button className="mt-1 text-[11px] font-medium text-brand-700" onClick={() => setShowKo((v) => !v)}>
          {showKo ? "한국어 접기" : "한국어로 보기"}
        </button>
      )}
      {showKo && <p className="mt-1 rounded-md bg-ink-50 px-2 py-1.5 text-xs leading-relaxed text-ink-700">{draft.reply_ko}</p>}
      <div className="mt-2">
        <FindingList v={draft.validation} />
      </div>
      <div className="mt-2 flex gap-1.5">
        <button className="btn-primary px-2.5 py-1 text-xs" disabled={!draft.validation.passed} onClick={onUse}>
          이 초안 사용
        </button>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={onEditKo}>
          한국어로 고쳐 쓰기
        </button>
        <button className="btn-quiet ml-auto px-2 py-1 text-xs" onClick={onReject}>
          제외
        </button>
      </div>
    </div>
  );
}

function SourceItem({ s }: { s: Source }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-ink-100 bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-ink-500">{s.id}</span>
        <span className="truncate text-xs font-medium">{s.section}</span>
        <span className="ml-auto text-[10px] tabular-nums text-ink-500">{s.score.toFixed(1)}</span>
      </div>
      {s.text_ko && <p className="mt-1 text-xs leading-relaxed text-ink-700">{s.text_ko}</p>}
      <button className="mt-1 text-[11px] text-ink-500 hover:text-ink-900" onClick={() => setOpen((v) => !v)}>
        {open ? "영문 원문 접기" : "영문 원문"}
      </button>
      {open && <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{s.text}</p>}
    </li>
  );
}

export function CopilotPanel({
  conv,
  onUseDraft,
  onEditKo,
  onRejectDraft,
}: {
  conv: Conversation;
  onUseDraft: (d: Draft) => void;
  onEditKo: (text: string) => void;
  onRejectDraft: (d: Draft) => void;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const last: Message | undefined = [...conv.messages].reverse().find((m) => m.role === "customer" && m.analysis);
  const a = last?.analysis;
  const cls = a?.classification;
  const awaiting = conv.messages.at(-1)?.role === "customer";
  const drafts = (a?.drafts ?? []).filter((d) => !hidden[`${last?.id}-${d.style}`]);

  return (
    <aside className="scroll-thin flex w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-100 bg-ink-50 p-4">
      {cls && (
        <section>
          <h3 className="panel-title mb-2">문의 분석</h3>
          <div className="rounded-xl border border-ink-100 bg-surface p-3">
            <p className="text-sm font-medium leading-snug">{cls.intent_ko}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="chip bg-brand-50 text-brand-700">{CATEGORY_KO[cls.category]}</span>
              <span className={`chip ${cls.sentiment === "angry" ? "bg-red-50 text-red-700" : cls.sentiment === "frustrated" ? "bg-amber-50 text-amber-700" : "bg-ink-100 text-ink-700"}`}>
                감정 {SENTIMENT_KO[cls.sentiment]}
              </span>
              <span className={`chip ${cls.urgency === "high" ? "bg-red-50 text-red-700" : "bg-ink-100 text-ink-700"}`}>긴급도 {URGENCY_KO[cls.urgency]}</span>
              <span className="chip bg-ink-100 text-ink-700">언어 {cls.language.toUpperCase()}</span>
              {cls.pii_masked.length > 0 && (
                <span className="chip bg-violet-50 text-violet-700">개인정보 마스킹: {cls.pii_masked.join(", ")}</span>
              )}
            </div>
            {a?.timings_ms && (
              <p className="mt-2 text-[10px] tabular-nums text-ink-500">
                분석 {a.timings_ms.analyze}ms · 검색 {a.timings_ms.retrieve}ms · 초안 {a.timings_ms.drafts}ms · 합계 {a.timings_ms.total}ms
              </p>
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="panel-title mb-2">답변 초안 {awaiting ? "" : "· 답변 완료"}</h3>
        {awaiting ? (
          <div className="space-y-2">
            {drafts.map((d) => (
              <DraftCard
                key={d.style}
                draft={d}
                onUse={() => onUseDraft(d)}
                onEditKo={() => onEditKo(d.reply_ko.replace(/^\[근거 요약\]\s*/, ""))}
                onReject={() => {
                  setHidden((h) => ({ ...h, [`${last?.id}-${d.style}`]: true }));
                  onRejectDraft(d);
                }}
              />
            ))}
            {!drafts.length && <p className="text-xs text-ink-500">표시할 초안이 없습니다. 한국어로 직접 작성하세요.</p>}
          </div>
        ) : (
          <p className="rounded-lg bg-surface p-3 text-xs text-ink-500">고객의 새 메시지가 오면 초안이 생성됩니다.</p>
        )}
      </section>

      {a?.sources && a.sources.length > 0 && (
        <section>
          <h3 className="panel-title mb-2">근거 정책 (RAG)</h3>
          <ul className="space-y-2">
            {a.sources.map((s) => (
              <SourceItem key={s.id} s={s} />
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
