"use client";

import { useTheme, type Choice } from "./ThemeProvider";

const OPTIONS: { value: Choice; label: string; title: string }[] = [
  { value: "light", label: "☀", title: "라이트 모드" },
  { value: "dark", label: "☾", title: "다크 모드" },
  { value: "system", label: "자동", title: "시스템 설정 따르기" },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="화면 테마" className="flex rounded-lg bg-ink-100 p-0.5 text-xs">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={choice === o.value}
          title={o.title}
          onClick={() => setChoice(o.value)}
          className={`min-w-[30px] rounded-md px-2 py-1 font-medium transition ${
            choice === o.value ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
