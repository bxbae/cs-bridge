"use client";

import { useState } from "react";
import type { Channel } from "@/lib/types";

const PRESETS: { label: string; channel: Channel; name: string; email?: string; subject?: string; message: string }[] = [
  { label: "이중 결제 (채팅)", channel: "chat", name: "Mia Torres", message: "I got charged twice for the starter pack!! Please fix this." },
  { label: "아이템 증발 (이메일)", channel: "email", name: "Noah Park", email: "noah.park@example.com", subject: "Lost my legendary sword", message: "Hello,\n\nMy legendary sword vanished after I logged back in yesterday. Can you restore it?\n\nThanks,\nNoah" },
  { label: "해킹 의심 (채팅)", channel: "chat", name: "Liam Brooks", message: "Someone logged into my account and spent my crystals. I think I was hacked. My number is +1 415-555-0132." },
  { label: "접속 오류 (채팅)", channel: "chat", name: "Emma Wright", message: "I can't log in, it keeps showing error 1002 since this morning." },
];

export function NewInquiryModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: { channel: Channel; customer_name: string; customer_email?: string; subject?: string; message: string }) => Promise<void>;
}) {
  const [channel, setChannel] = useState<Channel>("chat");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        channel,
        customer_name: name,
        customer_email: channel === "email" ? email || undefined : undefined,
        subject: channel === "email" ? subject || undefined : undefined,
        message,
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">새 문의 (고객 시뮬레이션)</h2>
          <button className="btn-quiet px-2 py-1" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <p className="mb-4 text-xs text-ink-500">해외 고객이 보낸 채팅·이메일을 입력하면 번역·분류·초안 생성까지 바로 실행됩니다.</p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="chip border border-ink-300 bg-surface py-1 text-ink-700 hover:bg-ink-100"
              onClick={() => {
                setChannel(p.channel);
                setName(p.name);
                setEmail(p.email ?? "");
                setSubject(p.subject ?? "");
                setMessage(p.message);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs">
            {(["chat", "email"] as Channel[]).map((c) => (
              <button key={c} onClick={() => setChannel(c)} className={`flex-1 rounded-md py-1.5 font-medium ${channel === c ? "bg-surface shadow-sm" : "text-ink-500"}`}>
                {c === "chat" ? "채팅" : "이메일"}
              </button>
            ))}
          </div>
          <input className="field" placeholder="고객 이름" value={name} onChange={(e) => setName(e.target.value)} />
          {channel === "email" && (
            <>
              <input className="field" placeholder="고객 이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="field" placeholder="제목" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </>
          )}
          <textarea className="field h-32 resize-none" placeholder="고객 메시지 (영어 등 외국어)" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" disabled={!name.trim() || !message.trim() || busy} onClick={submit}>
            {busy ? "분석 중…" : "문의 접수"}
          </button>
        </div>
      </div>
    </div>
  );
}
