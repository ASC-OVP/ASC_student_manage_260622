import type { Prisma } from "@/lib/generated/prisma";

export type ScopedUser = {
  id: string;
  academyId: string;
  role: string;
};

export function studentWhereForUser(user: ScopedUser): Prisma.StudentWhereInput {
  if (user.role === "TEACHER") {
    return {
      academyId: user.academyId,
      OR: [
        { teacherId: user.id },
        { studentClasses: { some: { classGroup: { teacherId: user.id } } } },
      ],
    };
  }

  if (user.role === "ASSISTANT") {
    return {
      academyId: user.academyId,
      OR: [
        { assistantId: user.id },
        {
          studentClasses: {
            some: {
              classGroup: {
                OR: [
                  { assistantId: user.id },
                  { classAssistants: { some: { assistantId: user.id } } },
                ],
              },
            },
          },
        },
      ],
    };
  }

  return { academyId: user.academyId };
}

export function canExportFullAcademy(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
