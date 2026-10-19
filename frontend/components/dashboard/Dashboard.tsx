"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY_KO, CHANNEL_KO, longDate, pct } from "@/lib/labels";
import type { Dashboard } from "@/lib/types";
import { ChartWithTable, Legend, RingMeter } from "../charts";
import { IconArrowIn, IconArrowOut, IconBolt, IconChevronRight, IconClock, IconDownload, IconInbox } from "../icons";
import { DemoNote, exportCsv, InquiryTable, InquiryTrend, Loading, useDashboard } from "./shared";

/** White main column (trend + recent activity) and a lavender side panel (briefing + summary). */
export function Dashboard() {
  const [days, setDays] = useState(14);
  const { data: d, error } = useDashboard(days);
  if (!d) return <Loading error={error} />;
  const t = d.totals;
  const passRate = t.drafts ? 1 - t.blocked / t.drafts : null;

  return (
    <div className="flex min-h-full flex-col xl:flex-row">
      <div className="min-w-0 flex-1 space-y-8 px-8 pb-8 pt-2">
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h1 className="text-xl font-semibold">문의 추이</h1>
            <Legend items={[{ label: "채팅", color: "chart-1" }, { label: "이메일", color: "chart-2" }]} />
            <div className="ml-auto flex items-center gap-2 text-xs text-ink-500">
              <span>합계</span>
              <span className="rounded-full bg-surface px-3 py-1.5 font-semibold text-ink-900 shadow-[0_6px_18px_-10px_rgba(30,30,60,0.4)]">{t.inquiries}건</span>
              <button onClick={() => exportCsv(d)} title="데이터 내보내기 (CSV)" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink-700 shadow-[0_6px_18px_-10px_rgba(30,30,60,0.4)]">
                <IconDownload size={15} />
              </button>
            </div>
          </div>
          <ChartWithTable chart={<InquiryTrend d={d} height={230} />} table={<InquiryTable d={d} />} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { n: 7, label: "1주" },
              { n: 14, label: "2주" },
              { n: 30, label: "1개월" },
              { n: 60, label: "2개월" },
            ].map((o) => (
              <button key={o.n} onClick={() => setDays(o.n)}
                className={`rounded-full py-2 text-sm font-medium transition ${days === o.n ? "bg-accent text-white shadow-[0_8px_20px_-8px_rgb(var(--accent)/0.9)]" : "bg-ink-50 text-ink-700 hover:bg-ink-100"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <RecentList d={d} />
        <DemoNote />
      </div>

      <aside className="w-full shrink-0 space-y-8 bg-surface-2 px-8 py-6 xl:w-[400px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">오늘의 브리핑</h2>
            <Link href="/console" aria-label="콘솔 열기" className="text-ink-700"><IconChevronRight /></Link>
          </div>
          <div className="relative h-[170px]">
            <div className="absolute right-0 top-3 h-[150px] w-[48%] rounded-2xl bg-brand-500/50" />
            <div className="absolute right-6 top-1.5 h-[160px] w-[60%] rounded-2xl bg-brand-600/70" />
            <Link href={t.open_waiting ? `/console?id=${d.queue[0]?.id}` : "/console"}
              className="absolute left-0 top-0 flex h-[170px] w-[82%] flex-col justify-between rounded-2xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-[0_18px_30px_-16px_rgb(var(--accent)/0.9)]">
              <div className="flex items-center justify-between">
                <span className="flex h-7 w-11 items-center rounded-full bg-white/30 px-1"><span className="h-5 w-5 rounded-full bg-white" /></span>
                <span className="text-[10px] uppercase tracking-widest text-white/80">Waiting</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/70">답변 대기 · 긴급</div>
                <div className="text-3xl font-semibold tracking-wider tabular-nums">{t.open_waiting} · {t.high_waiting}</div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="truncate pr-2">{d.queue[0] ? `${d.queue[0].customer_name} · ${CATEGORY_KO[d.queue[0].category ?? "other"]}` : "대기 문의 없음"}</span>
                <span className="shrink-0 text-white/80">{CHANNEL_KO[d.queue[0]?.channel ?? "chat"]}</span>
              </div>
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">응대 요약</h2>
            <span className="text-xs text-ink-500">{days}일</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card flex items-center gap-3 p-4">
              <RingMeter value={t.adoption_rate} color="chart-1" size={52}><IconArrowOut size={16} /></RingMeter>
              <div><div className="text-xs text-ink-500">초안 채택률</div><div className="font-semibold tabular-nums">{pct(t.adoption_rate)}</div></div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <RingMeter value={passRate} color="accent" size={52}><IconArrowIn size={16} /></RingMeter>
              <div><div className="text-xs text-ink-500">가드 통과율</div><div className="font-semibold tabular-nums">{pct(passRate)}</div></div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniTile icon={<IconBolt size={18} />} tone="bg-brand-500" label="이번 주 문의" value={`${t.week}건`}
              delta={t.week_delta} />
            <MiniTile icon={<IconClock size={18} />} tone="bg-brand-600" label="첫 초안까지"
              value={t.avg_first_draft_ms == null ? "–" : `${(t.avg_first_draft_ms / 1000).toFixed(1)}초`} />
            <MiniTile icon={<IconInbox size={18} />} tone="bg-accent" label="답변 대기" value={`${t.open_waiting}건`} />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Link href="/console?new=1" className="flex-1 rounded-xl bg-brand-600 py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-strong">새 문의 접수</Link>
          <Link href="/console" className="flex-1 py-3.5 text-center text-sm font-semibold text-brand-600">콘솔 열기</Link>
        </div>
      </aside>
    </div>
  );
}

function MiniTile({ icon, tone, label, value, delta }: { icon: React.ReactNode; tone: string; label: string; value: string; delta?: number | null }) {
  return (
    <div className="card p-3.5">
      <span className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-white ${tone}`}>{icon}</span>
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
      {delta != null && (
        <div className="mt-1 text-[11px] text-ink-500">
          {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% <span className="opacity-70">지난주 대비</span>
        </div>
      )}
    </div>
  );
}

function RecentList({ d }: { d: Dashboard }) {
  const groups = new Map<string, Dashboard["recent"]>();
  for (const r of d.recent) {
    const key = new Date(r.at).toLocaleDateString("sv-SE"); // local YYYY-MM-DD
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold">최근 상담</h2>
        <Link href="/console" className="text-xs font-medium text-ink-500 hover:text-ink-900">전체 보기</Link>
      </div>
      {[...groups.entries()].map(([day, items]) => (
        <div key={day}>
          <p className="border-b border-ink-100 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">{longDate(day)}</p>
          <ul>
            {items.map((r, i) => (
              <li key={i}>
                <Link href={`/console?id=${r.conversation_id}`} className="flex items-center gap-4 py-3.5 hover:opacity-80">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[0_6px_18px_-10px_rgba(30,30,60,0.45)] ${r.role === "customer" ? "bg-surface text-accent" : "bg-surface text-brand-600"}`}>
                    {r.role === "customer" ? <IconArrowIn size={16} /> : <IconArrowOut size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      {r.role === "customer" ? "문의 · " : "답변 → "}<b className="font-semibold">{r.customer_name}</b>
                    </div>
                    <div className="truncate text-xs text-ink-500">{r.text}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="font-medium text-ink-700">{CATEGORY_KO[r.category ?? "other"]}</div>
                    <div className="text-ink-500">{CHANNEL_KO[r.channel]} · {new Date(r.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
