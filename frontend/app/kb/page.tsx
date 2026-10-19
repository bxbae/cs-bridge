"use client";

import { useEffect, useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import { api } from "@/lib/api";
import { CATEGORY_KO } from "@/lib/labels";

type Chunk = Awaited<ReturnType<typeof api.kb>>[number];

export default function KnowledgeBasePage() {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [glossary, setGlossary] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.kb(), api.glossary()])
      .then(([k, g]) => { setChunks(k); setGlossary(g); })
      .catch(() => setError("백엔드에 연결할 수 없습니다."));
  }, []);

  const docs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (c: Chunk) => !needle || [c.title, c.section, c.text, c.text_ko].some((t) => t.toLowerCase().includes(needle));
    const map = new Map<string, Chunk[]>();
    for (const c of chunks.filter(hit)) map.set(c.title, [...(map.get(c.title) ?? []), c]);
    return [...map.entries()];
  }, [chunks, q]);

  return (
    <div className="grid gap-4 p-4 pt-6 lg:grid-cols-[1fr_320px] lg:px-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">지식베이스</h1>
            <p className="text-sm text-ink-500">답변 초안과 검증 가드가 근거로 쓰는 정책 문서 {chunks.length}개 섹션</p>
          </div>
          <label className="relative ml-auto w-full max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"><IconSearch size={16} /></span>
            <input className="field rounded-full pl-9" placeholder="정책 검색 (예: refund, 점검)" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {docs.map(([title, items]) => (
          <section key={title} className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="card-title">{title}</h2>
              <span className="chip bg-brand-50 text-brand-700">{CATEGORY_KO[items[0].category] ?? items[0].category}</span>
            </div>
            <ul className="divide-y divide-ink-100">
              {items.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-500">{c.id}</span>
                    <span className="text-sm font-medium">{c.section}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700">{c.text_ko}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">{c.text}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!docs.length && !error && chunks.length > 0 && <p className="text-sm text-ink-500">검색 결과가 없습니다.</p>}
      </div>

      <aside className="card h-fit p-5">
        <h2 className="card-title">용어집</h2>
        <p className="mb-3 text-xs text-ink-500">번역 시 반드시 지키는 공식 용어 (위반 시 검증 경고)</p>
        <ul className="divide-y divide-ink-100 text-sm">
          {Object.entries(glossary).map(([ko, en]) => (
            <li key={ko} className="flex justify-between gap-3 py-2"><span>{ko}</span><span className="text-right font-medium text-brand-700">{en}</span></li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
