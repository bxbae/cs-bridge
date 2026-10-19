"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";

export type Mode = "light" | "dark";
export type Choice = Mode | "system";
export type Design = "a" | "b"; // a = 1안 (blue, top pills), b = 2안 (indigo/coral, icon rail)

const THEME_KEY = "theme";
const DESIGN_KEY = "design";

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null; // storage blocked (private mode, sandboxed iframe)
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* still applies for this session */
  }
}

interface ThemeValue {
  mode: Mode; // what is shown right now
  choice: Choice; // what the user picked ("system" = follow the OS)
  setChoice: (c: Choice) => void;
  design: Design;
  setDesign: (d: Design) => void;
  ready: boolean; // stored preferences have been read (layout can render without a flash)
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  // Only an explicit user pick is stored; null means "follow the OS setting".
  const [picked, setPicked] = useState<Mode | null>(null);
  const [design, setDesignState] = useState<Design>("a");
  const [ready, setReady] = useState(false);

  // Read storage after mount: never during render, so server rendering cannot crash.
  useEffect(() => {
    setPicked(read<Mode>(THEME_KEY, ["light", "dark"]));
    setDesignState(read<Design>(DESIGN_KEY, ["a", "b"]) ?? "a");
    setReady(true);
  }, []);

  const mode: Mode = picked ?? (prefersDark ? "dark" : "light");

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.classList.toggle("dark", mode === "dark");
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.design = design;
  }, [design]);

  const setChoice = useCallback((c: Choice) => {
    const next = c === "system" ? null : c;
    setPicked(next);
    write(THEME_KEY, next);
  }, []);

  const setDesign = useCallback((d: Design) => {
    setDesignState(d);
    write(DESIGN_KEY, d);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ mode, choice: picked ?? "system", setChoice, design, setDesign, ready }),
    [mode, picked, setChoice, design, setDesign, ready],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Inline script for <head>: applies theme + design before first paint (no flash). */
export const themeInitScript = `try{var r=document.documentElement;var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';r.dataset.theme=t;if(t==='dark')r.classList.add('dark');var d=localStorage.getItem('${DESIGN_KEY}');r.dataset.design=(d==='b')?'b':'a'}catch(e){}`;
