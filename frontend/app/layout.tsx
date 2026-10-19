import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Bridge · 글로벌 상담 코파일럿",
  description: "해외 고객 채팅·이메일 상담을 번역·분류·근거 기반 답변 초안·검증으로 돕는 상담원 콘솔",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
