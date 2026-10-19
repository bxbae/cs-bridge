"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { demoSnapshotDate } from "@/lib/demo/demoApi";
import type { Health } from "@/lib/types";
import { IconBell, IconBook, IconChat, IconDashboard, IconPower, IconSearch } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "대시보드", Icon: IconDashboard },
  { href: "/console", label: "상담 콘솔", Icon: IconChat },
  { href: "/kb", label: "지식베이스", Icon: IconBook },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

function DemoBanner() {
  const [date, setDate] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    demoSnapshotDate().then((d) => setDate(new Date(d).toLocaleDateString("ko-KR"))).catch(() => setDate(null));
  }, []);
  if (!open) return null;
  return (
    <div className="mx-8 mb-2 flex items-center gap-3 rounded-2xl bg-accent-50 px-4 py-2 text-xs text-ink-700">
      <span className="chip bg-accent text-white">정적 데모</span>
      <span className="min-w-0 flex-1">
        백엔드 없이 브라우저에서 동작합니다. 번역 미리보기·검증 가드·상담 기록은 실제로 동작하고, 새 문의는 프리셋만 접수됩니다. 새로고침하면 초기화됩니다.
        {date && <span className="text-ink-500"> · 데이터 스냅샷 {date}</span>}
      </span>
      <a href="https://github.com/bxbae/cs-bridge" target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-brand-600 hover:underline">GitHub</a>
      <button onClick={() => setOpen(false)} aria-label="안내 닫기" className="shrink-0 text-ink-500 hover:text-ink-900">✕</button>
    </div>
  );
}

function ProviderBadge({ health }: { health: Health | null }) {
  if (!health) return null;
  if (health.llm_provider === "demo") return null; // the demo banner explains it
  const mock = health.llm_provider === "mock";
  return (
    <span
      title={mock ? "API 키 없이 오프라인 규칙으로 동작 중 (번역·분류 품질은 실제 LLM 연결 시 확인)" : `LLM: ${health.llm_provider}`}
      className={`chip hidden xl:inline-flex ${mock ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}
    >
      LLM {mock ? "mock" : health.llm_provider}
    </span>
  );
}

function LogoMark() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
      <path d="M17 2 32 28H2L17 2Z" fill="rgb(var(--brand-600))" />
      <circle cx="17" cy="19" r="4" fill="rgb(var(--accent))" />
    </svg>
  );
}

/** App frame: left icon rail + underline tabs, inside a rounded container on the canvas. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="flex h-screen p-3 lg:p-6">
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-[28px] bg-app shadow-[0_20px_60px_-30px_rgba(30,30,60,0.35)]">
        <nav className="flex w-[76px] shrink-0 flex-col items-center gap-2 border-r border-ink-100 py-6" aria-label="주 메뉴">
          <Link href="/" className="mb-6" aria-label="CS Bridge 홈"><LogoMark /></Link>
          {NAV.map(({ href, label, Icon }) => {
            const on = isActive(path, href);
            return (
              <Link key={href} href={href} title={label} aria-current={on ? "page" : undefined}
                className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition ${on ? "text-brand-600" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"}`}>
                {on && <span className="absolute -left-[16px] h-6 w-1 rounded-r bg-accent" />}
                <Icon size={20} />
              </Link>
            );
          })}
          <div className="mt-auto flex flex-col items-center gap-3">
            <ThemeToggle vertical />
            <span className="mt-2 text-ink-500" title="로그아웃 (데모)"><IconPower size={20} /></span>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[72px] shrink-0 items-center gap-8 px-8">
            <span className="mr-2 text-[15px] font-semibold tracking-tight">CS Bridge</span>
            {NAV.map(({ href, label }) => {
              const on = isActive(path, href);
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined}
                  className={`relative py-2 text-sm transition ${on ? "font-semibold text-ink-900" : "text-ink-500 hover:text-ink-900"}`}>
                  {label}
                  {on && <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded bg-ink-900" />}
                </Link>
              );
            })}
            <div className="ml-auto flex items-center gap-4 text-ink-700">
              <ProviderBadge health={health} />
              <Link href="/console" title="문의 찾기"><IconSearch size={20} /></Link>
              <IconBell size={20} />
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-hero-from to-hero-to text-xs font-semibold text-white ring-2 ring-surface">
                EB
              </div>
            </div>
          </header>
          {DEMO && <DemoBanner />}
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
