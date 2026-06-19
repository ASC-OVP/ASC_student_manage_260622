import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { studentWhereForUser } from "@/lib/scopes";
import { recordActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const students = await prisma.student.findMany({
    where: studentWhereForUser(user),
    include: {
      teacher: { select: { name: true } },
      assistant: { select: { name: true } },
      studentClasses: {
        include: { classGroup: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      attendanceRecords: { orderBy: { date: "desc" }, take: 1 },
      assignmentRecords: { orderBy: { date: "desc" }, take: 1 },
      scoreRecords: { orderBy: { date: "desc" }, take: 1 },
      memos: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ name: "asc" }],
  });

  const header = [
    "이름",
    "학생 연락처",
    "보호자 연락처",
    "학교",
    "학년",
    "과목",
    "레벨",
    "반",
    "담당 강사",
    "담당 조교",
    "상태",
    "최근 출석",
    "최근 과제",
    "최근 점수",
    "최근 메모",
  ];

  const lines = [
    header,
    ...students.map((student) => {
      const latestAttendance = student.attendanceRecords[0];
      const latestAssignment = student.assignmentRecords[0];
      const latestScore = student.scoreRecords[0];
      const latestMemo = student.memos[0];
      return [
        student.name,
        student.phone ?? "",
        student.parentPhone ?? "",
        student.schoolName ?? "",
        student.grade ?? "",
        student.subject ?? "",
        student.currentLevel ?? "",
        student.studentClasses.map((item) => item.classGroup.name).join(" / "),
        student.teacher?.name ?? "",
        student.assistant?.name ?? "",
        student.status,
        latestAttendance ? `${latestAttendance.date} ${latestAttendance.status}` : "",
        latestAssignment ? `${latestAssignment.date} ${latestAssignment.status}${latestAssignment.score !== null ? ` ${latestAssignment.score}` : ""}` : "",
        latestScore ? `${latestScore.date} ${latestScore.title} ${latestScore.score ?? ""}/${latestScore.maxScore}` : "",
        latestMemo?.content ?? "",
      ];
    }),
  ];

  await recordActivity({
    actor: user,
    action: "EXPORT",
    entityType: "Student",
    summary: `학생 CSV 내보내기 ${students.length}명`,
  });

  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="asc-students-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
