import type { Metadata } from "next";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Bridge · 글로벌 상담 코파일럿",
  description: "해외 고객 채팅·이메일 상담을 번역·분류·근거 기반 답변 초안·검증으로 돕는 상담원 콘솔",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The init script sets class/data-theme before React hydrates, so the mismatch is expected.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
