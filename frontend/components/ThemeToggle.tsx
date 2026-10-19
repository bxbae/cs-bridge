"use client";

import { IconAuto, IconMoon, IconSun } from "./icons";
import { useTheme, type Choice, type Design } from "./ThemeProvider";

const MODES: { value: Choice; title: string; Icon: typeof IconSun }[] = [
  { value: "light", title: "라이트 모드", Icon: IconSun },
  { value: "dark", title: "다크 모드", Icon: IconMoon },
  { value: "system", title: "시스템 설정 따르기", Icon: IconAuto },
];

const segment = "flex rounded-full bg-ink-100 p-0.5 text-xs";
const item = (on: boolean) =>
  `flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 font-medium transition ${
    on ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
  }`;

export function ThemeToggle({ vertical = false }: { vertical?: boolean }) {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="화면 테마" className={`${segment} ${vertical ? "flex-col" : ""}`}>
      {MODES.map(({ value, title, Icon }) => (
        <button key={value} role="radio" aria-checked={choice === value} title={title} onClick={() => setChoice(value)} className={item(choice === value)}>
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

export function DesignToggle({ vertical = false }: { vertical?: boolean }) {
  const { design, setDesign } = useTheme();
  const opts: { value: Design; label: string; title: string }[] = [
    { value: "a", label: "1안", title: "디자인 1안 · 블루" },
    { value: "b", label: "2안", title: "디자인 2안 · 인디고·코랄" },
  ];
  return (
    <div role="radiogroup" aria-label="디자인 시안" className={`${segment} ${vertical ? "flex-col" : ""}`}>
      {opts.map((o) => (
        <button key={o.value} role="radio" aria-checked={design === o.value} title={o.title} onClick={() => setDesign(o.value)} className={item(design === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
