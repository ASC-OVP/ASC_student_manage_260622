import type { Metadata } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";

export const metadata: Metadata = {
  title: "ASC 학원 운영 보드",
  description: "학생 현황, 출결, 과제, 성적, 메모, 조교 업무를 관리하는 ASC 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
