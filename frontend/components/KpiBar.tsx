import type { Kpi } from "@/lib/types";
import { pct } from "@/lib/labels";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex min-w-[120px] flex-1 flex-col px-4 py-2.5 leading-tight">
      <span className="text-[11px] text-ink-500">{label}</span>
      <span className="mt-0.5 text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Live console KPIs (the dashboard has the trend view). */
export function KpiStrip({ kpi }: { kpi: Kpi | null }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-3">
      <Stat label="진행 중" value={String(kpi?.by_status?.open ?? 0)} />
      <Stat label="초안 채택률" value={pct(kpi?.draft_adoption_rate)} />
      <Stat label="평균 수정률" value={pct(kpi?.avg_edit_ratio)} />
      <Stat label="첫 초안까지" value={kpi?.avg_first_draft_ms == null ? "–" : `${(kpi.avg_first_draft_ms / 1000).toFixed(1)}초`} />
      <Stat label="가드 차단 초안" value={`${kpi?.drafts_blocked_by_guard ?? 0} / ${kpi?.drafts_generated ?? 0}`} />
    </div>
  );
}
