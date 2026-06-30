import type { Metadata } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
import StickyMemoLauncher from "@/features/memos/components/StickyMemoLauncher";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "ASC 학원 운영 보드",
  description: "학생 현황, 출결, 과제, 성적, 메모, 조교 업무를 관리하는 ASC 시스템",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const stickyMemos = user
    ? await prisma.personalStickyMemo.findMany({
        where: { academyId: user.academyId, userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, content: true, color: true, updatedAt: true },
      })
    : [];

  return (
    <html lang="ko">
      <body>
        <AppFrame
          stickyLauncher={
            user ? (
              <StickyMemoLauncher
                memos={stickyMemos.map((memo) => ({
                  id: memo.id,
                  content: memo.content,
                  color: memo.color,
                  updatedAt: formatShortDateTime(memo.updatedAt),
                }))}
              />
            ) : null
          }
        >
          {children}
        </AppFrame>
      </body>
    </html>
  );
}

function formatShortDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

