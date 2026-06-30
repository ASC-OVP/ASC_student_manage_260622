
import { prisma } from "@/lib/prisma";

export function canManageExam(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

export async function findExamForUser(examId: string, academyId: string) {
  return prisma.exam.findFirst({
    where: { id: examId, academyId },
    include: { answerKeys: true },
  });
}
