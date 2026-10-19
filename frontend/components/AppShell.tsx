"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Health } from "@/lib/types";
import { IconBell, IconBook, IconChat, IconDashboard, IconPower, IconSearch } from "./icons";
import { useTheme } from "./ThemeProvider";
import { DesignToggle, ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "대시보드", Icon: IconDashboard },
  { href: "/console", label: "상담 콘솔", Icon: IconChat },
  { href: "/kb", label: "지식베이스", Icon: IconBook },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

function ProviderBadge({ health }: { health: Health | null }) {
  if (!health) return null;
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

function Avatar() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-hero-from to-hero-to text-xs font-semibold text-white ring-2 ring-surface">
      EB
    </div>
  );
}

function LogoMark({ design }: { design: "a" | "b" }) {
  if (design === "b") {
    return (
      <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
        <path d="M17 2 32 28H2L17 2Z" fill="rgb(var(--brand-600))" />
        <circle cx="17" cy="19" r="4" fill="rgb(var(--accent))" />
      </svg>
    );
  }
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle key={deg} cx={15 + 8 * Math.cos((deg * Math.PI) / 180)} cy={15 + 8 * Math.sin((deg * Math.PI) / 180)} r="5.2" fill="rgb(var(--brand-600))" />
      ))}
      <circle cx="15" cy="15" r="4" fill="rgb(var(--surface))" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { design, ready } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  // The canvas color is already correct (set by the head script); wait one tick for the layout.
  if (!ready) return <div className="h-screen" aria-busy="true" />;

  if (design === "b") {
    return (
      <div className="flex h-screen p-3 lg:p-6">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-[28px] bg-app shadow-[0_20px_60px_-30px_rgba(30,30,60,0.35)]">
          <nav className="flex w-[76px] shrink-0 flex-col items-center gap-2 border-r border-ink-100 py-6" aria-label="주 메뉴">
            <Link href="/" className="mb-6" aria-label="CS Bridge 홈"><LogoMark design="b" /></Link>
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
              <DesignToggle vertical />
              <ThemeToggle vertical />
              <span className="mt-2 text-ink-500" title="로그아웃 (데모)"><IconPower size={20} /></span>
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-[72px] shrink-0 items-center gap-8 px-8">
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
                <IconSearch size={20} />
                <IconBell size={20} />
                <Avatar />
              </div>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen p-3 lg:p-6">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-app">
        <header className="m-4 mb-0 flex h-[68px] shrink-0 items-center gap-4 rounded-full bg-surface px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="CS Bridge 홈">
            <LogoMark design="a" />
            <span className="text-lg font-semibold tracking-tight">CS Bridge</span>
          </Link>
          <nav className="mx-auto flex items-center gap-2" aria-label="주 메뉴">
            {NAV.map(({ href, label }) => {
              const on = isActive(path, href);
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined}
                  className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${on ? "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgb(var(--brand-600)/0.7)]" : "bg-ink-50 text-ink-700 hover:bg-ink-100"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <ProviderBadge health={health} />
            <DesignToggle />
            <ThemeToggle />
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-700"><IconBell size={17} /></span>
            <Avatar />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
