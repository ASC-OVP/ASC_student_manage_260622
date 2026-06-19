import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canExportFullAcademy } from "@/lib/scopes";
import { getRecentActivity, recordActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();

  if (!canExportFullAcademy(user.role)) {
    return NextResponse.json({ error: "관리자 또는 실장만 전체 백업을 받을 수 있습니다." }, { status: 403 });
  }

  const [
    academy,
    users,
    students,
    classGroups,
    studentClasses,
    classMemos,
    attendanceRecords,
    assignmentRecords,
    scoreRecords,
    studentMemos,
    tasks,
    taskComments,
    taskHistories,
    exams,
    omrUploads,
    examResults,
    activityLogs,
  ] = await Promise.all([
    prisma.academy.findUnique({ where: { id: user.academyId } }),
    prisma.user.findMany({
      where: { academyId: user.academyId },
      select: { id: true, name: true, loginId: true, role: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.student.findMany({ where: { academyId: user.academyId }, orderBy: { name: "asc" } }),
    prisma.classGroup.findMany({
      where: { academyId: user.academyId },
      include: { classAssistants: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.studentClass.findMany({ where: { academyId: user.academyId }, orderBy: { createdAt: "asc" } }),
    prisma.classMemo.findMany({ where: { academyId: user.academyId }, orderBy: { createdAt: "desc" } }),
    prisma.attendanceRecord.findMany({ where: { academyId: user.academyId }, orderBy: [{ date: "desc" }] }),
    prisma.assignmentRecord.findMany({ where: { academyId: user.academyId }, orderBy: [{ date: "desc" }] }),
    prisma.scoreRecord.findMany({ where: { academyId: user.academyId }, orderBy: [{ date: "desc" }] }),
    prisma.studentMemo.findMany({
      where: { student: { academyId: user.academyId } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { academyId: user.academyId },
      include: { checklistItems: true, submissions: true, reviews: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.taskComment.findMany({ where: { task: { academyId: user.academyId } }, orderBy: { createdAt: "desc" } }),
    prisma.taskStatusHistory.findMany({ where: { task: { academyId: user.academyId } }, orderBy: { createdAt: "desc" } }),
    prisma.exam.findMany({
      where: { academyId: user.academyId },
      include: { answerKeys: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.omrUpload.findMany({
      where: { academyId: user.academyId },
      include: { recognizedAnswers: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.examResult.findMany({
      where: { academyId: user.academyId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    }),
    getRecentActivity(user.academyId, 500),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: { id: user.id, name: user.name, role: user.role },
    academy,
    users,
    students,
    classGroups,
    studentClasses,
    classMemos,
    attendanceRecords,
    assignmentRecords,
    scoreRecords,
    studentMemos,
    tasks,
    taskComments,
    taskHistories,
    exams,
    omrUploads,
    examResults,
    activityLogs,
  };

  await recordActivity({
    actor: user,
    action: "BACKUP",
    entityType: "Academy",
    entityId: user.academyId,
    summary: "전체 백업 JSON 다운로드",
  });

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="asc-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
