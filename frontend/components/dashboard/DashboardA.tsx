"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORY_KO, CHANNEL_KO, FINDING_KO, pct, shortDate, STATUS_KO, URGENCY_DOT, waitingLabel } from "@/lib/labels";
import { ChartWithTable, ColumnChart, Legend, LineChart, Meter, TableView } from "../charts";
import { IconBook, IconChat, IconDownload, IconFilter, IconPlus, IconSearch } from "../icons";
import { categoryItems, DemoNote, exportCsv, InquiryTable, InquiryTrend, Initials, Loading, useDashboard, useGreeting } from "./shared";

/** 1안 — blue, rounded white cards on a light canvas, gradient briefing card (Youcare reference). */
export function DashboardA() {
  const [days, setDays] = useState(14);
  const { data: d, error } = useDashboard(days);
  const hello = useGreeting("Eric");
  const [slide, setSlide] = useState(0);
  const queue = d?.queue ?? [];

  useEffect(() => {
    if (queue.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % Math.min(3, queue.length)), 5000);
    return () => clearInterval(t);
  }, [queue.length]);

  if (!d) return <Loading error={error} />;
  const t = d.totals;
  const resolved = d.by_status.resolved ?? 0, open = d.by_status.open ?? 0, escalated = d.by_status.escalated ?? 0;
  const all = Math.max(1, resolved + open + escalated);
  const avgCat = Object.values(d.by_category).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(d.by_category).length);
  const brief = queue[slide] ?? queue[0];
  const adoptionDays = d.daily.map((r) => r.adoption_rate);

  return (
    <div className="space-y-4 p-4 pt-6 lg:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-h-[38px] text-[30px] font-bold tracking-tight text-brand-600">{hello}</h1>
        <Link href="/console?new=1" className="btn-primary ml-auto px-5 py-2.5 shadow-[0_8px_20px_-8px_rgb(var(--brand-600)/0.8)]">
          <IconPlus size={16} /> 새 문의 접수
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="btn-ghost cursor-default"><IconFilter size={15} /> 기간</span>
        <div className="flex rounded-full bg-surface p-1">
          {[7, 14].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`rounded-full px-4 py-1 text-sm font-medium transition ${days === n ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-900"}`}>
              {n}일
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={() => exportCsv(d)}><IconDownload size={15} /> 데이터 내보내기</button>
        <div className="ml-auto flex gap-2">
          <Link href="/console" className="btn-ghost"><IconSearch size={15} /> 문의 찾기</Link>
          <Link href="/kb" className="btn-ghost"><IconBook size={15} /> 지식베이스</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">문의 추이</h2>
            <span className="chip border border-ink-100 px-3 py-1 text-ink-700">{days}일</span>
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="chip bg-ink-900 text-surface">총 {t.inquiries}건</span>
            <Legend items={[{ label: "채팅", color: "chart-1" }, { label: "이메일", color: "chart-2" }]} />
          </div>
          <ChartWithTable chart={<InquiryTrend d={d} height={170} />} table={<InquiryTable d={d} />} />
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-6 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[rgb(var(--hero-from))]"><IconChat size={20} /></span>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[rgb(var(--hero-from))]">오늘의 브리핑</span>
          </div>
          <h2 className="relative mt-5 text-lg font-semibold">답변 대기 {t.open_waiting}건 · 긴급 {t.high_waiting}건</h2>
          {brief ? (
            <Link href={`/console?id=${brief.id}`} className="relative mt-2 block text-sm leading-relaxed text-white/90 hover:text-white">
              <b className="font-semibold">{brief.customer_name}</b> · {CATEGORY_KO[brief.category ?? "other"]} — {brief.preview}
            </Link>
          ) : (
            <p className="relative mt-2 text-sm text-white/90">대기 중인 문의가 없습니다. 좋은 하루 보내세요!</p>
          )}
          <div className="relative mt-5 flex gap-2" aria-hidden="true">
            {queue.slice(0, 3).map((q, i) => (
              <span key={q.id} className={`h-1.5 flex-1 rounded-full ${i === slide ? "bg-white" : "bg-white/35"}`} />
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">초안 채택률</h2>
            <span className="text-[11px] text-ink-500">{days}일 평균</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[34px] font-bold tracking-tight">{pct(t.adoption_rate)}</span>
            <span className="chip border border-brand-100 text-brand-700">{t.replies}건 중 초안 사용</span>
          </div>
          <LineChart
            series={[{ key: "adopt", label: "채택률", color: "chart-1", values: adoptionDays }]}
            xLabels={d.daily.map((r) => shortDate(r.date))}
            tooltipTitle={(i) => d.daily[i].date}
            format={(v) => `${Math.round(v * 100)}%`}
            yMaxHint={1}
            height={112}
            area
            compact
          />
        </section>

        <section className="card p-5">
          <h2 className="card-title mb-4">처리 현황</h2>
          <ul className="space-y-4">
            {[
              { k: "resolved", n: resolved, color: "brand-600" },
              { k: "open", n: open, color: "brand-600" },
              { k: "escalated", n: escalated, color: "brand-600" },
            ].map((s) => (
              <li key={s.k} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-100 text-xs font-semibold tabular-nums">{s.n}</span>
                <div className="flex-1">
                  <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{STATUS_KO[s.k]}</span><span className="text-xs text-ink-500">{Math.round((s.n / all) * 100)}%</span></div>
                  <Meter value={s.n / all} color={s.color} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">검증 가드</h2>
            <Link href="/kb" className="btn-ghost px-3 py-1 text-xs">정책 보기</Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-ink-100 py-3 text-sm">
            <div><dt className="text-xs text-ink-500">생성된 초안</dt><dd className="font-semibold tabular-nums">{t.drafts}</dd></div>
            <div><dt className="text-xs text-ink-500">차단된 초안</dt><dd className="font-semibold tabular-nums">{t.blocked}</dd></div>
            <div><dt className="text-xs text-ink-500">첫 초안까지</dt><dd className="font-semibold tabular-nums">{t.avg_first_draft_ms == null ? "–" : `${(t.avg_first_draft_ms / 1000).toFixed(1)}초`}</dd></div>
            <div><dt className="text-xs text-ink-500">이번 주 문의</dt><dd className="font-semibold tabular-nums">{t.week}건 <span className="text-xs font-normal text-ink-500">(지난주 {t.week_prev})</span></dd></div>
          </dl>
          <p className="mb-2 mt-3 text-xs text-ink-500">경고·차단 유형</p>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(d.guard_findings).length ? Object.entries(d.guard_findings).map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{FINDING_KO[k] ?? k}</span><span className="tabular-nums text-ink-500">{v}</span></li>
            )) : <li className="text-ink-500">기록된 경고가 없습니다.</li>}
          </ul>
        </section>

        <section className="card p-5 md:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="card-title">카테고리별 문의</h2>
            <span className="text-[11px] text-ink-500">가로선: 카테고리 평균</span>
          </div>
          <ChartWithTable
            chart={<ColumnChart items={categoryItems(d)} height={230} refValue={avgCat} refLabel={`평균 ${avgCat.toFixed(1)}건`} unit="건" />}
            table={<TableView columns={["카테고리", "문의"]} rows={Object.entries(d.by_category).map(([k, v]) => [CATEGORY_KO[k] ?? k, v])} />}
          />
        </section>

        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="card-title">답변 대기 문의</h2>
            <Link href="/console" className="btn-ghost px-3 py-1 text-xs">전체 보기</Link>
          </div>
          <ul className="divide-y divide-ink-100">
            {queue.map((q) => (
              <li key={q.id}>
                <Link href={`/console?id=${q.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                  <Initials name={q.customer_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className={`h-2 w-2 rounded-full ${URGENCY_DOT[q.urgency ?? "low"]}`} />
                      <span className="truncate">{q.customer_name}</span>
                    </div>
                    <div className="truncate text-xs text-ink-500">{CHANNEL_KO[q.channel]} · {CATEGORY_KO[q.category ?? "other"]} · {waitingLabel(q.waiting_minutes)}</div>
                  </div>
                </Link>
              </li>
            ))}
            {!queue.length && <li className="py-6 text-center text-sm text-ink-500">대기 중인 문의가 없습니다.</li>}
          </ul>
        </section>
      </div>
      <DemoNote />
    </div>
  );
}
