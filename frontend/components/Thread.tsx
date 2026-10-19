"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Message } from "@/lib/types";

function Bubble({ m, channel, showOriginal }: { m: Message; channel: string; showOriginal: boolean }) {
  const isCustomer = m.role === "customer";
  const time = new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const main = isCustomer ? m.text_ko || m.text : m.text;
  const sub = isCustomer ? (showOriginal ? m.text : null) : m.text_ko;

  return (
    <div className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] ${isCustomer ? "" : "items-end"} flex flex-col gap-1`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isCustomer
              ? "rounded-tl-sm border border-ink-100 bg-surface"
              : "rounded-tr-sm bg-brand-600 text-white"
          } ${channel === "email" ? "font-[450]" : ""}`}
        >
          {main}
        </div>
        {sub && (
          <div
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed ${
              isCustomer ? "bg-ink-100 text-ink-700" : "bg-brand-50 text-brand-700"
            }`}
          >
            <span className="mr-1 font-semibold">{isCustomer ? "원문" : "한국어"}</span>
            {sub}
          </div>
        )}
        <span className={`text-[10px] text-ink-500 ${isCustomer ? "" : "text-right"}`}>
          {isCustomer ? "고객" : "상담원"} · {time}
        </span>
      </div>
    </div>
  );
}

export function Thread({ conv }: { conv: Conversation }) {
  const [showOriginal, setShowOriginal] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [conv.messages.length, conv.id]);

  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">
      <div className="mb-4 flex justify-center">
        <button className="btn-quiet text-xs" onClick={() => setShowOriginal((v) => !v)}>
          {showOriginal ? "고객 원문 숨기기" : "고객 원문 보기"}
        </button>
      </div>
      <div className="space-y-4">
        {conv.messages.map((m) => (
          <Bubble key={m.id} m={m} channel={conv.channel} showOriginal={showOriginal} />
        ))}
      </div>
      <div ref={end} />
    </div>
  );
}
