"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/* ---------- helpers ---------- */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round an axis max up to 1/2/5 x 10^n so ticks are clean numbers. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Monotone cubic path (Fritsch–Carlson): smooth like the references, never overshoots the data. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const m = [slope[0], ...slope.slice(1).map((s, i) => (s * slope[i] <= 0 ? 0 : (s + slope[i]) / 2)), slope[n - 2]];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

const col = (token: string, alpha = 1) => `rgb(var(--${token}) / ${alpha})`;

/* ---------- legend & table ---------- */

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: col(i.color) }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function TableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-56 overflow-auto rounded-xl border border-ink-100">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-ink-50 text-ink-500">
          <tr>{columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink-100">
              {r.map((v, j) => <td key={j} className={`px-3 py-1.5 ${j ? "tabular-nums" : ""}`}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Wraps a chart with a "표로 보기" switch: required relief for light series colors under 3:1 contrast. */
export function ChartWithTable({ chart, table, className = "" }: { chart: ReactNode; table: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className={className}>
      <div className="mb-1 flex justify-end">
        <button onClick={() => setAsTable((v) => !v)} className="text-[11px] font-medium text-ink-500 hover:text-ink-900">
          {asTable ? "차트로 보기" : "표로 보기"}
        </button>
      </div>
      {asTable ? table : chart}
    </div>
  );
}

/* ---------- line / area chart ---------- */

export interface Series {
  key: string;
  label: string;
  color: string; // CSS variable token name, e.g. "chart-1"
  values: (number | null)[];
}

export function LineChart({
  series,
  xLabels,
  tooltipTitle,
  height = 190,
  area = false,
  compact = false,
  yMaxHint,
  format = (v) => String(v),
}: {
  series: Series[];
  xLabels: string[];
  tooltipTitle?: (i: number) => string;
  height?: number;
  area?: boolean;
  compact?: boolean;
  yMaxHint?: number;
  format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const n = xLabels.length;
  const max = yMaxHint ?? niceMax(Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v != null))));
  const ticks = [0, max / 2, max];
  // Left padding fits the widest tick label (~6.5px per char at 11px) so nothing is clipped.
  const pad = { l: 14 + 6.5 * Math.max(...ticks.map((t) => format(t).length)), r: 10, t: 12, b: compact ? 6 : 24 };
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 46))));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px) / Math.max(1, iw)) * (n - 1)))));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ") + " 추이"}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={col(s.color, 0.16)} />
                <stop offset="100%" stopColor={col(s.color, 0.02)} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={col("ink-100")} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={col("ink-500")}>{format(t)}</text>
            </g>
          ))}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as [number, number]))).filter((p): p is [number, number] => !!p);
            if (!pts.length) return null;
            const d = monotonePath(pts);
            return (
              <g key={s.key}>
                {area && <path d={`${d} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`} fill={`url(#${gid}-${s.key})`} />}
                <path d={d} fill="none" stroke={col(s.color)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {!compact && xLabels.map((l, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= Math.max(2, every * 0.75))) && (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill={col("ink-500")}>{l}</text>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={col("ink-300")} strokeWidth={1} />
              {series.map((s) => s.values[hover] != null && (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] as number)} r={4.5} fill={col(s.color)} stroke={col("surface")} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={pad.l} y={0} width={iw} height={height} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[120px] rounded-xl bg-ink-900 px-3 py-2 text-xs text-surface shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), width - 130), top: 0 }}
        >
          <div className="mb-1 font-medium opacity-80">{tooltipTitle ? tooltipTitle(hover) : xLabels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: col(s.color) }} />
              <span className="opacity-80">{s.label}</span>
              <span className="ml-auto font-semibold tabular-nums">{s.values[hover] == null ? "–" : format(s.values[hover] as number)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- column chart ---------- */

export function ColumnChart({
  items,
  height = 220,
  refValue,
  refLabel,
  format = (v) => String(v),
  unit = "",
}: {
  items: { label: string; value: number }[];
  height?: number;
  refValue?: number;
  refLabel?: string;
  format?: (v: number) => string;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 30, r: 8, t: 22, b: 26 };
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...items.map((i) => i.value), refValue ?? 0));
  const band = items.length ? iw / items.length : 0;
  const bw = Math.min(24, band * 0.5);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const top = items.reduce((best, it, i) => (it.value > items[best].value ? i : best), 0);

  // Column with 4px rounded data-end, square at the baseline.
  const colPath = (cx: number, v: number) => {
    const h = Math.max(0, pad.t + ih - y(v));
    const r = Math.min(4, h, bw / 2);
    const x0 = cx - bw / 2, x1 = cx + bw / 2, yb = pad.t + ih, yt = yb - h;
    return `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x1 - r} Q${x1},${yt} ${x1},${yt + r} V${yb} Z`;
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="카테고리별 문의 수">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={col("ink-100")} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={col("ink-500")}>{format(t)}</text>
            </g>
          ))}
          {refValue != null && (
            <g>
              <line x1={pad.l} x2={width - pad.r} y1={y(refValue)} y2={y(refValue)} stroke={col("brand-600", 0.7)} strokeWidth={1} />
              <circle cx={pad.l} cy={y(refValue)} r={3.5} fill={col("brand-600")} stroke={col("surface")} strokeWidth={2} />
              {refLabel && <text x={width - pad.r} y={y(refValue) - 6} textAnchor="end" fontSize={10} fill={col("ink-500")}>{refLabel}</text>}
            </g>
          )}
          {items.map((it, i) => {
            const cx = pad.l + band * (i + 0.5);
            const emphasized = i === top || i === hover;
            return (
              <g key={it.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                <path d={colPath(cx, it.value)} fill={emphasized ? col("chart-1") : col("chart-1", 0.28)} />
                {i === top && <text x={cx} y={y(it.value) - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={col("ink-900")}>{format(it.value)}</text>}
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={col("ink-500")}>{it.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div className="pointer-events-none absolute z-10 rounded-xl bg-ink-900 px-3 py-2 text-xs text-surface shadow-lg"
          style={{ left: Math.min(Math.max(pad.l + band * (hover + 0.5) + 14, 0), width - 120), top: Math.max(0, y(items[hover].value) - 10) }}>
          <div className="font-medium opacity-80">{items[hover].label}</div>
          <div className="font-semibold tabular-nums">{format(items[hover].value)}{unit}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- ring meter (one rate, not a part-to-whole comparison) ---------- */

export function RingMeter({ value, color = "chart-1", size = 56, children }: { value: number | null; color?: string; size?: number; children?: ReactNode }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={value == null ? "데이터 없음" : `${Math.round(v * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col(color, 0.16)} strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col(color)} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-ink-900">{children}</div>
    </div>
  );
}

/* ---------- progress meter ---------- */

export function Meter({ value, color = "brand-600" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: col(color, 0.14) }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: col(color) }} />
    </div>
  );
}
