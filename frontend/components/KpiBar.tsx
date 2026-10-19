import type { Health, Kpi } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-ink-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function KpiBar({ kpi, health }: { kpi: Kpi | null; health: Health | null }) {
  const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-100 bg-surface px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">CB</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">CS Bridge</div>
          <div className="text-[11px] text-ink-500">글로벌 상담 코파일럿</div>
        </div>
        {health && (
          <span className={`chip ml-2 ${health.llm_provider === "mock" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}>
            LLM: {health.llm_provider === "mock" ? "mock (오프라인)" : health.llm_provider}
          </span>
        )}
      </div>
      <div className="hidden items-center gap-6 md:flex">
        <Stat label="진행 중" value={String(kpi?.by_status?.open ?? 0)} />
        <Stat label="초안 채택률" value={pct(kpi?.draft_adoption_rate)} />
        <Stat label="평균 수정률" value={pct(kpi?.avg_edit_ratio)} />
        <Stat label="첫 초안까지" value={kpi?.avg_first_draft_ms == null ? "–" : `${(kpi.avg_first_draft_ms / 1000).toFixed(1)}초`} />
        <Stat label="가드 차단 초안" value={`${kpi?.drafts_blocked_by_guard ?? 0} / ${kpi?.drafts_generated ?? 0}`} />
        <ThemeToggle />
      </div>
    </header>
  );
}
