import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "이슈 대응·성과 보고서 초안 생성기",
  description: "키워드와 뉴스 본문으로 이슈 대응 및 성과 보고서 초안을 빠르게 생성합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
