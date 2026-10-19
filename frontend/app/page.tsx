"use client";

import { useCallback, useEffect, useState } from "react";
import { Composer, type ComposerLoad } from "@/components/Composer";
import { ConversationList } from "@/components/ConversationList";
import { CopilotPanel } from "@/components/CopilotPanel";
import { KpiBar } from "@/components/KpiBar";
import { NewInquiryModal } from "@/components/NewInquiryModal";
import { SummaryCard } from "@/components/SummaryCard";
import { Thread } from "@/components/Thread";
import { api } from "@/lib/api";
import { CHANNEL_KO, STATUS_KO } from "@/lib/labels";
import type { Conversation, ConversationListItem, Health, Kpi } from "@/lib/types";

export default function ConsolePage() {
  const [list, setList] = useState<ConversationListItem[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [load, setLoad] = useState<ComposerLoad | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [l, k] = await Promise.all([api.list(), api.kpi()]);
    setList(l);
    setKpi(k);
    return l;
  }, []);

  const open = useCallback(async (id: number) => {
    setConv(await api.get(id));
    setShowSummary(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setHealth(await api.health());
        const l = await refresh();
        if (l.length) await open(l[0].id);
      } catch {
        setError("백엔드에 연결할 수 없습니다. backend 서버(포트 8000)가 실행 중인지 확인하세요.");
      }
    })();
  }, [refresh, open]);

  const afterChange = async (c: Conversation) => {
    setConv(c);
    await refresh();
  };

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <KpiBar kpi={kpi} health={health} />
      {error && <div className="bg-red-50 px-5 py-2 text-xs font-medium text-red-800">{error}</div>}
      <div className="flex min-h-0 flex-1">
        <ConversationList items={list} selectedId={conv?.id ?? null} onSelect={open} onNew={() => setShowNew(true)} />

        {conv ? (
          <>
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-ink-100 bg-surface px-6 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-base font-semibold">{conv.customer_name}</h1>
                    <span className="chip bg-ink-100 text-ink-700">{CHANNEL_KO[conv.channel]}</span>
                    <span className="chip bg-ink-100 text-ink-500">{STATUS_KO[conv.status]}</span>
                  </div>
                  <p className="truncate text-xs text-ink-500">
                    {conv.subject ? `${conv.subject} · ` : ""}
                    {conv.customer_email ?? `#${conv.id}`}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      run("summary", async () => {
                        await api.summary(conv.id);
                        await afterChange(await api.get(conv.id));
                        setShowSummary(true);
                      })
                    }
                  >
                    {busy === "summary" ? "정리 중…" : "상담 기록 정리"}
                  </button>
                  {conv.status === "open" ? (
                    <button className="btn-ghost text-xs" onClick={() => run("status", async () => { await api.setStatus(conv.id, "resolved"); await afterChange(await api.get(conv.id)); })}>
                      해결로 종료
                    </button>
                  ) : (
                    <button className="btn-ghost text-xs" onClick={() => run("status", async () => { await api.setStatus(conv.id, "open"); await afterChange(await api.get(conv.id)); })}>
                      다시 열기
                    </button>
                  )}
                </div>
              </div>

              {conv.summary && showSummary && <SummaryCard s={conv.summary} onClose={() => setShowSummary(false)} />}
              <Thread conv={conv} />

              <div className="flex shrink-0 items-center gap-2 border-t border-dashed border-ink-100 bg-ink-50 px-6 py-2">
                <span className="text-[11px] font-medium text-ink-500">고객 후속 메시지 시뮬레이션</span>
                <input
                  className="field flex-1 py-1 text-xs"
                  placeholder="e.g. I tried that but it still doesn't work."
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && followUp.trim() && !busy) {
                      run("follow", async () => {
                        await afterChange(await api.customerMessage(conv.id, followUp));
                        setFollowUp("");
                      });
                    }
                  }}
                />
                <button
                  className="btn-ghost py-1 text-xs"
                  disabled={!followUp.trim() || busy !== null}
                  onClick={() => run("follow", async () => { await afterChange(await api.customerMessage(conv.id, followUp)); setFollowUp(""); })}
                >
                  {busy === "follow" ? "분석 중…" : "고객으로 보내기"}
                </button>
              </div>

              <Composer conv={conv} load={load} onSent={afterChange} />
            </main>

            <CopilotPanel
              conv={conv}
              onUseDraft={(draft) => setLoad({ nonce: Date.now(), kind: "draft", draft })}
              onEditKo={(text) => setLoad({ nonce: Date.now(), kind: "ko", text })}
              onRejectDraft={(d) => run("reject", async () => { await api.rejectDraft(conv.id, d.style); setKpi(await api.kpi()); })}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-500">왼쪽에서 문의를 선택하세요.</div>
        )}
      </div>

      {showNew && (
        <NewInquiryModal
          onClose={() => setShowNew(false)}
          onCreate={async (body) => {
            const c = await api.create(body);
            setShowNew(false);
            await afterChange(c);
          }}
        />
      )}
    </div>
  );
}
