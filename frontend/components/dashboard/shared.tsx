"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_KO, greeting, shortDate } from "@/lib/labels";
import type { Dashboard } from "@/lib/types";
import { LineChart, TableView, type Series } from "../charts";

export function useDashboard(days: number) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.dashboard(days)
      .then((d) => alive && (setData(d), setError(null)))
      .catch(() => alive && setError("백엔드에 연결할 수 없습니다. backend 서버(포트 8000)가 실행 중인지 확인하세요."));
    return () => { alive = false; };
  }, [days]);
  return { data, error };
}

/** Greeting depends on the viewer's clock, so render it after mount (no hydration mismatch). */
export function useGreeting(name: string) {
  const [text, setText] = useState("");
  useEffect(() => setText(greeting(name)), [name]);
  return text;
}

export function exportCsv(d: Dashboard) {
  const header = ["date", "chat", "email", "inquiries", "agent_replies", "replies_from_draft", "adoption_rate", "drafts", "blocked"];
  const rows = d.daily.map((r) => [r.date, r.chat, r.email, r.inquiries, r.replies, r.from_draft, r.adoption_rate ?? "", r.drafts, r.blocked]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `cs-bridge-daily-${d.daily.at(-1)?.date}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function inquirySeries(d: Dashboard): Series[] {
  return [
    { key: "chat", label: "채팅", color: "chart-1", values: d.daily.map((r) => r.chat) },
    { key: "email", label: "이메일", color: "chart-2", values: d.daily.map((r) => r.email) },
  ];
}

export function InquiryTrend({ d, height = 190 }: { d: Dashboard; height?: number }) {
  return (
    <LineChart
      series={inquirySeries(d)}
      xLabels={d.daily.map((r) => shortDate(r.date))}
      tooltipTitle={(i) => d.daily[i].date}
      height={height}
      area
    />
  );
}

export function InquiryTable({ d }: { d: Dashboard }) {
  return (
    <TableView
      columns={["날짜", "채팅", "이메일", "답변", "초안 채택"]}
      rows={[...d.daily].reverse().map((r) => [r.date, r.chat, r.email, r.replies, r.adoption_rate == null ? "–" : `${Math.round(r.adoption_rate * 100)}%`])}
    />
  );
}

export function categoryItems(d: Dashboard) {
  return Object.entries(d.by_category).map(([k, v]) => ({ label: (CATEGORY_KO[k] ?? k).split("·")[0], value: v }));
}

export function Initials({ name, tone = "brand" }: { name: string; tone?: "brand" | "accent" }) {
  const letters = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-accent-50 text-ink-900"}`}>
      {letters}
    </span>
  );
}

export function DemoNote() {
  return (
    <p className="text-[11px] text-ink-500">
      지난 13일 데이터는 평가 문항을 실제 파이프라인에 통과시켜 만든 데모 이력입니다. 상담원 동작(채택·수정·제외)은 시뮬레이션입니다.
    </p>
  );
}

export function Loading({ error }: { error: string | null }) {
  return <div className="flex h-64 items-center justify-center text-sm text-ink-500">{error ?? "대시보드를 불러오는 중…"}</div>;
}
