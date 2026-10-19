"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { STYLE_KO } from "@/lib/labels";
import type { Conversation, Draft, Validation } from "@/lib/types";
import { FindingList, ValidationBadge } from "./Findings";

export type ComposerLoad = { nonce: number } & ({ kind: "draft"; draft: Draft } | { kind: "ko"; text: string });

export function Composer({
  conv,
  load,
  onSent,
}: {
  conv: Conversation;
  load: ComposerLoad | null;
  onSent: (c: Conversation) => void;
}) {
  const [textKo, setTextKo] = useState("");
  const [finalText, setFinalText] = useState("");
  const [backKo, setBackKo] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [stale, setStale] = useState(false);
  const [fromDraft, setFromDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"translate" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTextKo("");
    setFinalText("");
    setBackKo("");
    setValidation(null);
    setStale(false);
    setFromDraft(null);
    setError(null);
  };

  useEffect(reset, [conv.id]);

  useEffect(() => {
    if (!load) return;
    setError(null);
    if (load.kind === "draft") {
      setFromDraft(load.draft);
      setFinalText(load.draft.reply);
      setTextKo(load.draft.reply_ko.startsWith("[근거 요약]") ? "" : load.draft.reply_ko);
      setBackKo("");
      setValidation(load.draft.validation);
      setStale(false);
    } else {
      setTextKo(load.text);
      setFinalText("");
      setValidation(null);
      setFromDraft(null);
    }
  }, [load]);

  async function translate() {
    setBusy("translate");
    setError(null);
    try {
      const r = await api.translate(conv.id, textKo);
      setFinalText(r.reply);
      setBackKo(r.back_translation_ko);
      setValidation(r.validation);
      setStale(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const updated = await api.send(conv.id, {
        text: finalText,
        text_ko: textKo || backKo || null,
        draft_style: fromDraft?.style ?? null,
        draft_text: fromDraft?.reply ?? null,
      });
      reset();
      onSent(updated);
    } catch (e) {
      if (e instanceof ApiError && e.validation) {
        setValidation(e.validation);
        setStale(false);
      }
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = !!validation && !validation.passed && !stale;

  return (
    <div className="shrink-0 border-t border-ink-100 bg-surface px-6 py-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="panel-title">한국어로 작성</span>
            <span className="text-[11px] text-ink-500">용어집·숫자 보존 검사 포함</span>
          </div>
          <textarea
            className="field h-28 resize-none"
            placeholder="한국어로 답변을 쓰면 고객 언어로 번역하고 검증합니다."
            value={textKo}
            onChange={(e) => setTextKo(e.target.value)}
          />
          <button className="btn-ghost self-start" disabled={!textKo.trim() || busy !== null} onClick={translate}>
            {busy === "translate" ? "번역 중…" : `번역·검증 → ${conv.language.toUpperCase()}`}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="panel-title">
              고객에게 보낼 답변
              {fromDraft && <span className="ml-1 normal-case tracking-normal text-brand-700">· {STYLE_KO[fromDraft.style]} 초안</span>}
            </span>
            {validation && !stale && <ValidationBadge v={validation} />}
            {stale && <span className="chip bg-ink-100 text-ink-500">수정됨 · 보내기 시 재검증</span>}
          </div>
          <textarea
            className="field h-28 resize-none font-[450]"
            placeholder="초안을 선택하거나 한국어 답변을 번역하세요."
            value={finalText}
            onChange={(e) => {
              setFinalText(e.target.value);
              setStale(true);
            }}
          />
          <div className="flex items-center gap-2">
            <button className="btn-primary" disabled={!finalText.trim() || blocked || busy !== null} onClick={send}>
              {busy === "send" ? "보내는 중…" : conv.channel === "email" ? "이메일 보내기" : "보내기"}
            </button>
            {finalText && (
              <button className="btn-quiet text-xs" onClick={reset}>
                지우기
              </button>
            )}
          </div>
        </div>
      </div>

      {(validation?.findings.length || backKo || error) && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>{backKo && <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-700"><b className="mr-1">역번역</b>{backKo}</p>}</div>
          <div className="space-y-1">
            {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800">{error}</p>}
            {validation && !stale && <FindingList v={validation} />}
          </div>
        </div>
      )}
    </div>
  );
}
