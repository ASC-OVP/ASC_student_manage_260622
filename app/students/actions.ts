"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  defaultAssignmentSheetOptions,
  defaultAttendanceSheetOptions,
  normalizeSheetOptions,
  studentSheetOptionSettingKeys,
} from "@/lib/studentSheetOptions";
import {
  normalizeCustomCellValues,
  normalizeCustomColumnId,
  normalizeCustomColumns,
  studentSheetCustomSettingKeys,
} from "@/lib/studentSheetCustomColumns";
import { ClassGroupStatus, MemoType, Prisma, StudentStatus } from "@/lib/generated/prisma";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activityLog";

const STUDENT_STATUSES = Object.values(StudentStatus) as StudentStatus[];
const MEMO_TYPES = Object.values(MemoType) as MemoType[];
const CLASS_GROUP_STATUSES = Object.values(ClassGroupStatus) as ClassGroupStatus[];

type ClassLessonInput = {
  id: ReturnType<typeof randomUUID>;
  position: number;
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  memo: string | null;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function numberValue(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return undefined;

  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function cleanId(value: string | null) {
  if (!value || value === "none" || value === "-") return null;
  return value;
}

function cleanIds(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanId(String(value).trim()))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function classAssistantIds(formData: FormData) {
  const selectedIds = cleanIds(formData.getAll("assistantIds"));
  const legacyId = cleanId(nullableText(formData, "assistantId"));
  return selectedIds.length > 0 || formData.has("assistantIds") ? selectedIds : legacyId ? [legacyId] : [];
}

function backPath(formData: FormData, fallback: string) {
  const value = text(formData, "back") || text(formData, "from");
  return value || fallback;
}

function enumValue<T extends string>(value: string, values: readonly T[], fallback: T) {
  return values.includes(value as T) ? (value as T) : fallback;
}

function sheetStatusValue(value: string, fallback: string) {
  if (!value) return fallback;
  const cleaned = value.trim().slice(0, 48);
  return cleaned || fallback;
}

function detailStatusValue(value: string, fallback: string) {
  if (!value) return fallback;
  return /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : fallback;
}

function decimalValue(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function canManageClassGroups(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

function canManageStudents(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

async function findClassGroupForAcademy(academyId: string, classGroupId: string | null) {
  if (!classGroupId) return null;

  return prisma.classGroup.findFirst({
    where: { id: classGroupId, academyId },
    select: { id: true, teacherId: true },
  });
}

async function validateAssistantIds(academyId: string, assistantIds: string[]) {
  if (assistantIds.length === 0) return;

  const assistants = await prisma.user.findMany({
    where: { id: { in: assistantIds }, academyId, role: "ASSISTANT", isActive: true },
    select: { id: true },
  });

  if (assistants.length !== assistantIds.length) {
    throw new Error("담당 조교 정보를 확인해 주세요.");
  }
}

async function syncClassGroupAssistants(
  tx: Prisma.TransactionClient,
  academyId: string,
  classGroupId: string,
  assistantIds: string[]
) {
  await tx.classGroupAssistant.deleteMany({
    where: { academyId, classGroupId },
  });

  if (assistantIds.length === 0) return;

  await tx.classGroupAssistant.createMany({
    data: assistantIds.map((assistantId) => ({
      academyId,
      classGroupId,
      assistantId,
    })),
  });
}

export async function createStudent(formData: FormData) {
  const user = await requireUser();

  const name = text(formData, "name");
  const phone = nullableText(formData, "phone");
  const parentPhone = nullableText(formData, "parentPhone");
  const schoolName = nullableText(formData, "schoolName");
  const grade = nullableText(formData, "grade");
  const subject = nullableText(formData, "subject");
  const currentLevel = nullableText(formData, "currentLevel");
  const status = enumValue(text(formData, "status"), STUDENT_STATUSES, StudentStatus.ACTIVE);
  const memo = nullableText(formData, "memo");
  const teacherId = cleanId(nullableText(formData, "teacherId"));
  const assistantId = cleanId(nullableText(formData, "assistantId"));
  const classGroupId = cleanId(nullableText(formData, "classGroupId"));

  if (!name) {
    throw new Error("학생 이름은 필수입니다.");
  }

  const classGroup = await findClassGroupForAcademy(user.academyId, classGroupId);

  let createdStudentId = "";
  let createdStudentName = "";

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        academyId: user.academyId,
        name,
        phone,
        parentPhone,
        schoolName,
        grade,
        subject,
        currentLevel,
        status,
        memo,
        teacherId: teacherId ?? classGroup?.teacherId ?? null,
        assistantId,
      },
    });
    createdStudentId = student.id;
    createdStudentName = student.name;

    if (classGroup) {
      await tx.studentClass.create({
        data: {
          academyId: user.academyId,
          studentId: student.id,
          classGroupId: classGroup.id,
          isPrimary: true,
        },
      });
    }
  });

  if (createdStudentId) {
    await recordActivity({
      actor: user,
      action: "CREATE",
      entityType: "Student",
      entityId: createdStudentId,
      summary: `학생 생성: ${createdStudentName}`,
    });
  }

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(formData: FormData) {
  const user = await requireUser();

  const id = text(formData, "id") || text(formData, "studentId");
  const name = text(formData, "name");
  const phone = nullableText(formData, "phone");
  const parentPhone = nullableText(formData, "parentPhone");
  const schoolName = nullableText(formData, "schoolName");
  const grade = nullableText(formData, "grade");
  const subject = nullableText(formData, "subject");
  const currentLevel = nullableText(formData, "currentLevel");
  const status = enumValue(text(formData, "status"), STUDENT_STATUSES, StudentStatus.ACTIVE);
  const memo = nullableText(formData, "memo");
  const teacherId = cleanId(nullableText(formData, "teacherId"));
  const assistantId = cleanId(nullableText(formData, "assistantId"));
  const classGroupId = cleanId(nullableText(formData, "classGroupId"));
  const shouldUpdateClassGroup = formData.has("classGroupId");

  if (!id) {
    throw new Error("수정할 학생이 없습니다.");
  }

  if (!name) {
    throw new Error("학생 이름은 필수입니다.");
  }

  const student = await prisma.student.findFirst({
    where: { id, academyId: user.academyId },
    select: { id: true, name: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  const classGroup = await findClassGroupForAcademy(user.academyId, classGroupId);

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: {
        name,
        phone,
        parentPhone,
        schoolName,
        grade,
        subject,
        currentLevel,
        status,
        memo,
        teacherId: teacherId ?? classGroup?.teacherId ?? null,
        assistantId,
      },
    });

    if (shouldUpdateClassGroup) {
      await tx.studentClass.deleteMany({
        where: { academyId: user.academyId, studentId: id },
      });

      if (classGroup) {
        await tx.studentClass.create({
          data: {
            academyId: user.academyId,
            studentId: id,
            classGroupId: classGroup.id,
            isPrimary: true,
          },
        });
      }
    }
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "Student",
    entityId: id,
    summary: `학생 정보 수정: ${name}`,
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function deleteStudent(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id") || text(formData, "studentId");

  if (!id) {
    throw new Error("삭제할 학생이 없습니다.");
  }

  const student = await prisma.student.findFirst({
    where: { id, academyId: user.academyId },
    select: { id: true, name: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.student.delete({ where: { id } });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "Student",
    entityId: id,
    summary: `학생 삭제: ${student.name}`,
  });

  revalidatePath("/students");
  revalidatePath("/memos");
  redirect("/students");
}

export async function createStudentFromSheet(formData: FormData) {
  const user = await requireUser();
  if (!canManageStudents(user.role)) {
    throw new Error("학생을 추가할 권한이 없습니다.");
  }

  const name = text(formData, "name");
  const phone = nullableText(formData, "phone");
  const parentPhone = nullableText(formData, "parentPhone");
  const schoolName = nullableText(formData, "schoolName");
  const grade = nullableText(formData, "grade");
  const subject = nullableText(formData, "subject");
  const currentLevel = nullableText(formData, "currentLevel");
  const memo = nullableText(formData, "memo");
  const teacherId = cleanId(nullableText(formData, "teacherId"));
  const assistantId = cleanId(nullableText(formData, "assistantId"));
  const classGroupId = cleanId(nullableText(formData, "classGroupId"));

  if (!name) {
    throw new Error("학생 이름은 필수입니다.");
  }

  const classGroup = await findClassGroupForAcademy(user.academyId, classGroupId);

  let createdStudentId = "";
  let createdStudentName = "";

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        academyId: user.academyId,
        name,
        phone,
        parentPhone,
        schoolName,
        grade,
        subject,
        currentLevel,
        memo,
        teacherId: teacherId ?? classGroup?.teacherId ?? null,
        assistantId,
      },
    });
    createdStudentId = student.id;
    createdStudentName = student.name;

    if (classGroup) {
      await tx.studentClass.create({
        data: {
          academyId: user.academyId,
          studentId: student.id,
          classGroupId: classGroup.id,
          isPrimary: true,
        },
      });
    }
  });

  if (createdStudentId) {
    await recordActivity({
      actor: user,
      action: "CREATE",
      entityType: "Student",
      entityId: createdStudentId,
      summary: `시트에서 학생 추가: ${createdStudentName}`,
    });
  }

  revalidatePath("/students");
}

export async function deleteStudentFromSheet(formData: FormData) {
  const user = await requireUser();
  if (!canManageStudents(user.role)) {
    throw new Error("학생을 삭제할 권한이 없습니다.");
  }

  const id = text(formData, "id") || text(formData, "studentId");
  if (!id) {
    throw new Error("삭제할 학생을 확인해주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id, academyId: user.academyId },
    select: { id: true, name: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.student.delete({ where: { id } });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "Student",
    entityId: id,
    summary: `시트에서 학생 삭제: ${student.name}`,
  });

  revalidatePath("/students");
  revalidatePath("/memos");
}

export async function deleteStudentsFromSheet(formData: FormData) {
  const user = await requireUser();
  if (!canManageStudents(user.role)) {
    throw new Error("학생을 삭제할 권한이 없습니다.");
  }

  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);
  if (studentIds.length === 0) {
    throw new Error("삭제할 학생을 선택해주세요.");
  }

  const students = await prisma.student.findMany({
    where: { academyId: user.academyId, id: { in: studentIds } },
    select: { id: true, name: true },
  });

  await prisma.student.deleteMany({
    where: { academyId: user.academyId, id: { in: students.map((student) => student.id) } },
  });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "Student",
    summary: `학생 일괄 삭제: ${students.length}명`,
    metadata: { studentIds: students.map((student) => student.id), names: students.map((student) => student.name) },
  });

  revalidatePath("/students");
  revalidatePath("/memos");
}

export async function bulkStudentClassGroup(formData: FormData) {
  const user = await requireUser();
  if (!canManageStudents(user.role)) {
    throw new Error("학생의 반을 변경할 권한이 없습니다.");
  }

  const classGroupId = cleanId(nullableText(formData, "classGroupId"));
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  if (studentIds.length === 0) {
    throw new Error("반을 이동할 학생을 선택해주세요.");
  }

  const [students, classGroup] = await Promise.all([
    prisma.student.findMany({
      where: { academyId: user.academyId, id: { in: studentIds } },
      select: { id: true },
    }),
    findClassGroupForAcademy(user.academyId, classGroupId),
  ]);

  if (classGroupId && !classGroup) {
    throw new Error("이동할 반을 찾을 수 없습니다.");
  }

  await prisma.$transaction(async (tx) => {
    const ids = students.map((student) => student.id);

    await tx.studentClass.deleteMany({
      where: { academyId: user.academyId, studentId: { in: ids } },
    });

    if (classGroup) {
      for (const studentId of ids) {
        await tx.studentClass.create({
          data: {
            academyId: user.academyId,
            studentId,
            classGroupId: classGroup.id,
            isPrimary: true,
          },
        });
      }
    }

    await tx.student.updateMany({
      where: { academyId: user.academyId, id: { in: ids } },
      data: { teacherId: classGroup?.teacherId ?? null },
    });
  });

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "Student",
    summary: `학생 반 일괄 변경: ${students.length}명`,
    metadata: { classGroupId: classGroup?.id ?? null, studentIds: students.map((student) => student.id) },
  });

  revalidatePath("/students");
}

export async function bulkStudentAssistant(formData: FormData) {
  const user = await requireUser();
  if (!canManageStudents(user.role)) {
    throw new Error("담당 조교를 변경할 권한이 없습니다.");
  }

  const assistantId = cleanId(nullableText(formData, "assistantId"));
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  if (studentIds.length === 0) {
    throw new Error("담당 조교를 변경할 학생을 선택해주세요.");
  }

  if (assistantId) {
    const assistant = await prisma.user.findFirst({
      where: { id: assistantId, academyId: user.academyId, role: "ASSISTANT", isActive: true },
      select: { id: true },
    });

    if (!assistant) {
      throw new Error("담당 조교를 찾을 수 없습니다.");
    }
  }

  await prisma.student.updateMany({
    where: { academyId: user.academyId, id: { in: studentIds } },
    data: { assistantId },
  });

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "Student",
    summary: `담당 조교 일괄 변경: ${studentIds.length}명`,
    metadata: { assistantId: assistantId ?? null, studentIds },
  });

  revalidatePath("/students");
}

export async function createClassGroup(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const name = text(formData, "name");
  const teacherId =
    user.role === "TEACHER"
      ? user.id
      : cleanId(nullableText(formData, "teacherId"));
  const subject = nullableText(formData, "subject");
  const grade = nullableText(formData, "grade");
  const startDate = nullableText(formData, "startDate");
  const endDate = nullableText(formData, "endDate");
  const daysOfWeek = nullableText(formData, "daysOfWeek");
  const startTime = nullableText(formData, "startTime");
  const endTime = nullableText(formData, "endTime");
  const room = nullableText(formData, "room");
  const schedule = nullableText(formData, "schedule") ?? compactSchedule(daysOfWeek, startTime, endTime);
  const assistantIds = classAssistantIds(formData);
  const assistantId = assistantIds[0] ?? null;
  const status = enumValue(text(formData, "status"), CLASS_GROUP_STATUSES, ClassGroupStatus.ACTIVE);
  const description = nullableText(formData, "description");

  if (!name) {
    throw new Error("반 이름을 입력해 주세요.");
  }

  await validateAssistantIds(user.academyId, assistantIds);

  let createdClassGroupId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const classGroup = await tx.classGroup.create({
      data: {
        academyId: user.academyId,
        name,
        teacherId,
        assistantId,
        subject,
        grade,
        startDate,
        endDate,
        daysOfWeek,
        startTime,
        endTime,
        schedule,
        status,
        description,
      },
    });
    createdClassGroupId = classGroup.id;

    await tx.$executeRaw`UPDATE "ClassGroup" SET "room" = ${room} WHERE "id" = ${classGroup.id}`;
    await syncClassGroupAssistants(tx, user.academyId, classGroup.id, assistantIds);
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "ClassGroup",
    entityId: createdClassGroupId,
    summary: `반 생성: ${name}`,
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/calendar");
}

export async function updateClassGroup(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const id = text(formData, "classGroupId");
  const name = text(formData, "name");
  const teacherId =
    user.role === "TEACHER"
      ? user.id
      : cleanId(nullableText(formData, "teacherId"));
  const subject = nullableText(formData, "subject");
  const grade = nullableText(formData, "grade");
  const startDate = nullableText(formData, "startDate");
  const endDate = nullableText(formData, "endDate");
  const daysOfWeek = nullableText(formData, "daysOfWeek");
  const startTime = nullableText(formData, "startTime");
  const endTime = nullableText(formData, "endTime");
  const room = nullableText(formData, "room");
  const schedule = nullableText(formData, "schedule") ?? compactSchedule(daysOfWeek, startTime, endTime);
  const assistantIds = classAssistantIds(formData);
  const assistantId = assistantIds[0] ?? null;
  const status = enumValue(text(formData, "status"), CLASS_GROUP_STATUSES, ClassGroupStatus.ACTIVE);
  const description = nullableText(formData, "description");

  if (!id || !name) {
    throw new Error("수정할 반 정보를 확인해 주세요.");
  }

  const target = await prisma.classGroup.findFirst({
    where: {
      id,
      academyId: user.academyId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    select: { id: true },
  });

  if (!target) {
    throw new Error("반을 찾을 수 없습니다.");
  }

  await validateAssistantIds(user.academyId, assistantIds);

  await prisma.$transaction(async (tx) => {
    await tx.classGroup.update({
      where: { id },
      data: {
        name,
        teacherId,
        assistantId,
        subject,
        grade,
        startDate,
        endDate,
        daysOfWeek,
        startTime,
        endTime,
        schedule,
        status,
        description,
      },
    });

    await tx.$executeRaw`UPDATE "ClassGroup" SET "room" = ${room} WHERE "id" = ${id}`;
    await syncClassGroupAssistants(tx, user.academyId, id, assistantIds);
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ClassGroup",
    entityId: id,
    summary: `반 정보 수정: ${name}`,
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/calendar");
  revalidatePath(`/classes/${id}`);
}

export async function deleteClassGroup(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const id = text(formData, "classGroupId");
  if (!id) {
    throw new Error("삭제할 반을 확인해 주세요.");
  }

  const target = await prisma.classGroup.findFirst({
    where: {
      id,
      academyId: user.academyId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    select: { id: true, name: true },
  });

  if (!target) {
    throw new Error("반을 찾을 수 없습니다.");
  }

  await prisma.$transaction([
    prisma.studentClass.deleteMany({ where: { academyId: user.academyId, classGroupId: id } }),
    prisma.classGroup.delete({ where: { id } }),
  ]);

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "ClassGroup",
    entityId: id,
    summary: `반 삭제: ${target.name}`,
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/calendar");
}

function compactSchedule(daysOfWeek: string | null, startTime: string | null, endTime: string | null) {
  const time = [startTime, endTime].filter(Boolean).join("~");
  return [daysOfWeek, time].filter(Boolean).join(" ");
}

export async function updateAttendance(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const status = sheetStatusValue(text(formData, "status"), "PRESENT");

  if (!studentId || !date) {
    throw new Error("학생과 날짜가 필요합니다.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.$executeRaw`
    INSERT INTO AttendanceRecord (id, academyId, studentId, date, status, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${user.academyId}, ${studentId}, ${date}, ${status}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(studentId, date) DO UPDATE SET
      status = excluded.status,
      updatedAt = CURRENT_TIMESTAMP
  `;

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "AttendanceRecord",
    entityId: studentId,
    summary: `출석 변경: ${date} / ${status}`,
    metadata: { studentId, date, status },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function bulkAttendance(formData: FormData) {
  const user = await requireUser();

  const date = text(formData, "date");
  const status = sheetStatusValue(text(formData, "status"), "PRESENT");
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  if (!date || studentIds.length === 0) {
    throw new Error("날짜와 학생 선택이 필요합니다.");
  }

  const students = await prisma.student.findMany({
    where: {
      academyId: user.academyId,
      id: { in: studentIds },
    },
    select: { id: true },
  });

  await Promise.all(
    students.map((student) =>
      prisma.$executeRaw`
        INSERT INTO AttendanceRecord (id, academyId, studentId, date, status, createdAt, updatedAt)
        VALUES (${randomUUID()}, ${user.academyId}, ${student.id}, ${date}, ${status}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(studentId, date) DO UPDATE SET
          status = excluded.status,
          updatedAt = CURRENT_TIMESTAMP
      `
    )
  );

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "AttendanceRecord",
    summary: `출석 일괄 변경: ${date} / ${status} / ${students.length}명`,
    metadata: { studentIds: students.map((student) => student.id), date, status },
  });

  revalidatePath("/students");
}

export async function updateAssignment(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const title = text(formData, "title") || "과제";
  const status = sheetStatusValue(text(formData, "status"), "UNCHECKED");
  const hasScore = formData.has("score");
  const rawScore = text(formData, "score");
  const score = hasScore ? (rawScore ? Number(rawScore) : null) : undefined;

  if (!studentId || !date) {
    throw new Error("학생과 날짜가 필요합니다.");
  }

  if (hasScore && rawScore && typeof score === "number" && Number.isNaN(score)) {
    throw new Error("과제 점수는 숫자로 입력해주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  if (hasScore) {
    await prisma.$executeRaw`
      INSERT INTO AssignmentRecord (id, academyId, studentId, date, title, status, score, createdAt, updatedAt)
      VALUES (${randomUUID()}, ${user.academyId}, ${studentId}, ${date}, ${title}, ${status}, ${score}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(studentId, date, title) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        updatedAt = CURRENT_TIMESTAMP
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO AssignmentRecord (id, academyId, studentId, date, title, status, score, createdAt, updatedAt)
      VALUES (${randomUUID()}, ${user.academyId}, ${studentId}, ${date}, ${title}, ${status}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(studentId, date, title) DO UPDATE SET
        status = excluded.status,
        updatedAt = CURRENT_TIMESTAMP
    `;
  }

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "AssignmentRecord",
    entityId: studentId,
    summary: `과제 변경: ${date} / ${status}`,
    metadata: { studentId, date, title, status, score: score ?? null },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function bulkAssignment(formData: FormData) {
  const user = await requireUser();

  const date = text(formData, "date");
  const status = sheetStatusValue(text(formData, "status"), "UNCHECKED");
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  if (!date || studentIds.length === 0) {
    throw new Error("날짜와 학생 선택이 필요합니다.");
  }

  const students = await prisma.student.findMany({
    where: {
      academyId: user.academyId,
      id: { in: studentIds },
    },
    select: { id: true },
  });

  await Promise.all(
    students.map((student) =>
      prisma.$executeRaw`
        INSERT INTO AssignmentRecord (id, academyId, studentId, date, title, status, score, createdAt, updatedAt)
        VALUES (${randomUUID()}, ${user.academyId}, ${student.id}, ${date}, ${"과제"}, ${status}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(studentId, date, title) DO UPDATE SET
          status = excluded.status,
          score = NULL,
          updatedAt = CURRENT_TIMESTAMP
      `
    )
  );

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "AssignmentRecord",
    summary: `과제 일괄 변경: ${date} / ${status} / ${students.length}명`,
    metadata: { studentIds: students.map((student) => student.id), date, status },
  });

  revalidatePath("/students");
}

export async function updateStudentSheetCell(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const field = text(formData, "field");
  const value = nullableText(formData, "value");
  const editableFields = ["name", "phone", "parentPhone", "schoolName", "grade", "subject", "currentLevel", "memo"] as const;

  if (!studentId || !editableFields.includes(field as (typeof editableFields)[number])) {
    throw new Error("수정할 학생 칸을 확인해주세요.");
  }

  if (field === "name" && !value) {
    throw new Error("학생 이름은 비울 수 없습니다.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { [field]: value },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "Student",
    entityId: studentId,
    summary: `학생 셀 수정: ${field}`,
    metadata: { studentId, field },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function updateStudentClassGroup(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const classGroupId = cleanId(nullableText(formData, "classGroupId"));

  if (!studentId) {
    throw new Error("반을 수정할 학생을 확인해 주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  const classGroup = await findClassGroupForAcademy(user.academyId, classGroupId);

  await prisma.$transaction(async (tx) => {
    await tx.studentClass.deleteMany({
      where: { academyId: user.academyId, studentId },
    });

    if (classGroup) {
      await tx.studentClass.create({
        data: {
          academyId: user.academyId,
          studentId,
          classGroupId: classGroup.id,
          isPrimary: true,
        },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { teacherId: classGroup.teacherId },
      });
    } else {
      await tx.student.update({
        where: { id: studentId },
        data: { teacherId: null },
      });
    }
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "Student",
    entityId: studentId,
    summary: `학생 반 변경`,
    metadata: { studentId, classGroupId: classGroup?.id ?? null },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function updateStudentSheetOptions(formData: FormData) {
  const user = await requireUser();
  const target = text(formData, "target");
  const rawOptions = text(formData, "options");

  const defaults =
    target === "attendance"
      ? defaultAttendanceSheetOptions
      : target === "assignment"
        ? defaultAssignmentSheetOptions
        : null;
  const key =
    target === "attendance"
      ? studentSheetOptionSettingKeys.attendance
      : target === "assignment"
        ? studentSheetOptionSettingKeys.assignment
        : "";

  if (!defaults || !key) {
    throw new Error("설정할 선택지 종류를 확인해주세요.");
  }

  let parsed: unknown = null;
  try {
    parsed = rawOptions ? JSON.parse(rawOptions) : null;
  } catch {
    parsed = null;
  }

  const options = normalizeSheetOptions(parsed, defaults);
  const value = JSON.stringify(options);

  await prisma.$executeRaw`
    INSERT INTO AcademySetting (id, academyId, key, value, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${user.academyId}, ${key}, ${value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(academyId, key) DO UPDATE SET
      value = excluded.value,
      updatedAt = CURRENT_TIMESTAMP
  `;

  revalidatePath("/students");
}

export async function updateStudentSheetCustomColumns(formData: FormData) {
  const user = await requireUser();
  const rawColumns = text(formData, "columns");

  let parsed: unknown = null;
  try {
    parsed = rawColumns ? JSON.parse(rawColumns) : null;
  } catch {
    parsed = null;
  }

  const columns = normalizeCustomColumns(parsed);
  const value = JSON.stringify(columns);

  await prisma.$executeRaw`
    INSERT INTO AcademySetting (id, academyId, key, value, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${user.academyId}, ${studentSheetCustomSettingKeys.columns}, ${value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(academyId, key) DO UPDATE SET
      value = excluded.value,
      updatedAt = CURRENT_TIMESTAMP
  `;

  revalidatePath("/students");
}

export async function updateStudentSheetCustomCell(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const columnId = normalizeCustomColumnId(text(formData, "columnId"));
  const value = text(formData, "value").slice(0, 500);

  if (!studentId || !columnId) {
    throw new Error("커스텀 열 정보를 확인해주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT value
    FROM AcademySetting
    WHERE academyId = ${user.academyId}
      AND key = ${studentSheetCustomSettingKeys.values}
    LIMIT 1
  `;
  const current = rows[0]?.value;
  let parsed: unknown = null;

  try {
    parsed = current ? JSON.parse(current) : null;
  } catch {
    parsed = null;
  }

  const values = normalizeCustomCellValues(parsed);
  values[studentId] = { ...(values[studentId] ?? {}), [columnId]: value };
  const nextValue = JSON.stringify(values);

  await prisma.$executeRaw`
    INSERT INTO AcademySetting (id, academyId, key, value, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${user.academyId}, ${studentSheetCustomSettingKeys.values}, ${nextValue}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(academyId, key) DO UPDATE SET
      value = excluded.value,
      updatedAt = CURRENT_TIMESTAMP
  `;

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "Student",
    entityId: studentId,
    summary: `커스텀 셀 수정: ${columnId}`,
    metadata: { studentId, columnId },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function updateStudentSheetCustomCells(formData: FormData) {
  const user = await requireUser();
  const rawCells = text(formData, "cells");

  let parsed: unknown = null;
  try {
    parsed = rawCells ? JSON.parse(rawCells) : null;
  } catch {
    parsed = null;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("저장할 셀 정보를 확인해 주세요.");
  }

  const cells = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { studentId?: unknown; columnId?: unknown; value?: unknown };
      const studentId = String(raw.studentId ?? "").trim();
      const columnId = normalizeCustomColumnId(raw.columnId);
      const value = String(raw.value ?? "").slice(0, 500);
      return studentId && columnId ? { studentId, columnId, value } : null;
    })
    .filter((cell): cell is { studentId: string; columnId: string; value: string } => Boolean(cell));

  if (cells.length === 0) {
    throw new Error("저장할 셀이 없습니다.");
  }

  const studentIds = Array.from(new Set(cells.map((cell) => cell.studentId)));
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, academyId: user.academyId },
    select: { id: true },
  });
  const allowedStudentIds = new Set(students.map((student) => student.id));
  const allowedCells = cells.filter((cell) => allowedStudentIds.has(cell.studentId));

  if (allowedCells.length === 0) {
    throw new Error("저장할 학생 정보를 확인해 주세요.");
  }

  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT value
    FROM AcademySetting
    WHERE academyId = ${user.academyId}
      AND key = ${studentSheetCustomSettingKeys.values}
    LIMIT 1
  `;
  const current = rows[0]?.value;
  let currentParsed: unknown = null;

  try {
    currentParsed = current ? JSON.parse(current) : null;
  } catch {
    currentParsed = null;
  }

  const values = normalizeCustomCellValues(currentParsed);
  for (const cell of allowedCells) {
    values[cell.studentId] = { ...(values[cell.studentId] ?? {}), [cell.columnId]: cell.value };
  }
  const nextValue = JSON.stringify(values);

  await prisma.$executeRaw`
    INSERT INTO AcademySetting (id, academyId, key, value, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${user.academyId}, ${studentSheetCustomSettingKeys.values}, ${nextValue}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(academyId, key) DO UPDATE SET
      value = excluded.value,
      updatedAt = CURRENT_TIMESTAMP
  `;

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "Student",
    summary: `차시표 셀 저장: ${allowedCells.length}칸`,
    metadata: { count: allowedCells.length, studentIds },
  });

  revalidatePath("/students");
}

export async function updateStudentLessonCells(formData: FormData) {
  const user = await requireUser();
  const rawCells = text(formData, "cells");

  let parsed: unknown = null;
  try {
    parsed = rawCells ? JSON.parse(rawCells) : null;
  } catch {
    parsed = null;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("저장할 차시 셀 정보를 확인해 주세요.");
  }

  const cells = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { studentId?: unknown; date?: unknown; field?: unknown; value?: unknown };
      const studentId = String(raw.studentId ?? "").trim();
      const date = String(raw.date ?? "").trim();
      const field = String(raw.field ?? "").trim();
      const value = String(raw.value ?? "").trim().slice(0, 500);
      if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      if (!["attendance", "assignment", "test"].includes(field)) return null;
      return { studentId, date, field, value };
    })
    .filter((cell): cell is { studentId: string; date: string; field: string; value: string } => Boolean(cell));

  if (cells.length === 0) {
    throw new Error("저장할 차시 셀이 없습니다.");
  }

  const studentIds = Array.from(new Set(cells.map((cell) => cell.studentId)));
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, academyId: user.academyId },
    select: { id: true },
  });
  const allowedStudentIds = new Set(students.map((student) => student.id));
  const allowedCells = cells.filter((cell) => allowedStudentIds.has(cell.studentId));

  if (allowedCells.length === 0) {
    throw new Error("저장할 학생 정보를 확인해 주세요.");
  }

  await prisma.$transaction(async (tx) => {
    for (const cell of allowedCells) {
      if (cell.field === "attendance") {
        if (!cell.value) {
          await tx.attendanceRecord.deleteMany({ where: { studentId: cell.studentId, date: cell.date } });
        } else {
          await tx.attendanceRecord.upsert({
            where: { studentId_date: { studentId: cell.studentId, date: cell.date } },
            update: { status: cell.value },
            create: { academyId: user.academyId, studentId: cell.studentId, date: cell.date, status: cell.value },
          });
        }
      }

      if (cell.field === "assignment") {
        if (!cell.value) {
          await tx.assignmentRecord.deleteMany({ where: { studentId: cell.studentId, date: cell.date, title: "과제" } });
        } else {
          await tx.assignmentRecord.upsert({
            where: { studentId_date_title: { studentId: cell.studentId, date: cell.date, title: "과제" } },
            update: { status: cell.value },
            create: { academyId: user.academyId, studentId: cell.studentId, date: cell.date, title: "과제", status: cell.value },
          });
        }
      }

      if (cell.field === "test") {
        if (!cell.value) {
          await tx.scoreRecord.deleteMany({ where: { studentId: cell.studentId, date: cell.date, title: "테스트" } });
        } else {
          const numericScore = Number(cell.value);
          const score = Number.isInteger(numericScore) ? numericScore : null;
          await tx.scoreRecord.upsert({
            where: { studentId_date_title: { studentId: cell.studentId, date: cell.date, title: "테스트" } },
            update: { score, maxScore: 100, memo: cell.value },
            create: { academyId: user.academyId, studentId: cell.studentId, date: cell.date, title: "테스트", score, maxScore: 100, memo: cell.value },
          });
        }
      }
    }
  });

  await recordActivity({
    actor: user,
    action: "BULK_UPDATE",
    entityType: "Student",
    summary: `차시표 기록 저장: ${allowedCells.length}칸`,
    metadata: { count: allowedCells.length, studentIds },
  });

  revalidatePath("/students");
  for (const studentId of studentIds) revalidatePath(`/students/${studentId}`);
}

export async function saveClassLessonConfig(formData: FormData) {
  const user = await requireUser();
  const classGroupId = cleanId(text(formData, "classGroupId"));
  const rawLessons = text(formData, "lessons");

  if (!classGroupId) {
    throw new Error("차시를 저장할 반을 선택해 주세요.");
  }

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, academyId: user.academyId },
    select: { id: true, teacherId: true },
  });

  if (!classGroup) {
    throw new Error("반 정보를 확인해 주세요.");
  }

  if (user.role === "TEACHER" && classGroup.teacherId !== user.id) {
    throw new Error("담당 반의 차시만 수정할 수 있습니다.");
  }

  let parsed: unknown = null;
  try {
    parsed = rawLessons ? JSON.parse(rawLessons) : null;
  } catch {
    parsed = null;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("저장할 차시 정보를 확인해 주세요.");
  }

  const lessons = parsed
    .map((item, index): ClassLessonInput | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { title?: unknown; date?: unknown; startTime?: unknown; endTime?: unknown; memo?: unknown };
      const title = String(raw.title ?? "").slice(0, 80);
      const date = String(raw.date ?? "").trim();
      const startTime = String(raw.startTime ?? "").trim();
      const endTime = String(raw.endTime ?? "").trim();
      const memo = String(raw.memo ?? "").trim().slice(0, 500);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) return null;
      if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) return null;
      return {
        id: randomUUID(),
        position: index + 1,
        title,
        date: date || null,
        startTime: startTime || null,
        endTime: endTime || null,
        memo: memo || null,
      };
    })
    .filter((lesson): lesson is ClassLessonInput => lesson !== null);

  if (lessons.length === 0) {
    throw new Error("저장할 차시가 없습니다.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "ClassLesson" WHERE "academyId" = ${user.academyId} AND "classGroupId" = ${classGroupId}`;

    for (const lesson of lessons) {
      await tx.$executeRaw`
        INSERT INTO "ClassLesson" ("id", "academyId", "classGroupId", "position", "title", "lessonDate", "startTime", "endTime", "memo", "createdAt", "updatedAt")
        VALUES (${lesson.id}, ${user.academyId}, ${classGroupId}, ${lesson.position}, ${lesson.title}, ${lesson.date}, ${lesson.startTime}, ${lesson.endTime}, ${lesson.memo}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
    }
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ClassGroup",
    entityId: classGroupId,
    summary: `차시 설정 저장: ${lessons.length}개`,
    metadata: { classGroupId, lessonCount: lessons.length },
  });

  revalidatePath("/students");
  revalidatePath("/calendar");
  revalidatePath(`/classes/${classGroupId}`);
}
export async function updateScore(formData: FormData) {
  const user = await requireUser();

  const scoreRecordId = cleanId(text(formData, "scoreRecordId"));
  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const title = text(formData, "title") || "테스트";
  const rawScore = text(formData, "score");
  const score = rawScore ? Number(rawScore) : null;
  const maxScore = numberValue(formData, "maxScore") ?? 100;

  if (!studentId || !date) {
    throw new Error("학생과 날짜가 필요합니다.");
  }

  if (rawScore && typeof score === "number" && Number.isNaN(score)) {
    throw new Error("성적은 숫자로 입력해주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  if (scoreRecordId) {
    const record = await prisma.scoreRecord.findFirst({
      where: { id: scoreRecordId, academyId: user.academyId, studentId },
      select: { id: true },
    });

    if (!record) {
      throw new Error("수정할 성적 기록을 찾을 수 없습니다.");
    }

    await prisma.scoreRecord.update({
      where: { id: scoreRecordId },
      data: { date, title, score, maxScore },
    });

    await recordActivity({
      actor: user,
      action: "UPDATE",
      entityType: "ScoreRecord",
      entityId: scoreRecordId,
      summary: `성적 수정: ${title} / ${score ?? "-"}점`,
      metadata: { studentId, date, title, score, maxScore },
    });

    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return;
  }

  await prisma.scoreRecord.upsert({
    where: { studentId_date_title: { studentId, date, title } },
    update: { score, maxScore },
    create: {
      academyId: user.academyId,
      studentId,
      date,
      title,
      score,
      maxScore,
    },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ScoreRecord",
    entityId: studentId,
    summary: `성적 저장: ${title} / ${score ?? "-"}점`,
    metadata: { studentId, date, title, score, maxScore },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

export async function createMemo(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const content = text(formData, "content");
  const type = enumValue(text(formData, "type"), MEMO_TYPES, MemoType.GENERAL);
  const isImportant = formData.get("isImportant") === "on";

  if (!studentId || !content) {
    throw new Error("학생과 메모 내용이 필요합니다.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.studentMemo.create({
    data: {
      studentId,
      writerId: user.id,
      type,
      content,
      isImportant,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "StudentMemo",
    entityId: studentId,
    summary: `학생 메모 작성`,
    metadata: { studentId, type, isImportant },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/memos");

  redirect(backPath(formData, `/students/${studentId}`));
}

// 다른 페이지들이 이름을 다르게 import해도 안 터지게 별칭 유지
export async function createStudentMemoFromSheet(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const content = text(formData, "content");
  const type = enumValue(text(formData, "type"), MEMO_TYPES, MemoType.GENERAL);
  const isImportant = formData.get("isImportant") === "on";

  if (!studentId || !content) {
    throw new Error("학생과 메모 내용을 입력해주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.studentMemo.create({
    data: {
      studentId,
      writerId: user.id,
      type,
      content,
      isImportant,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "StudentMemo",
    entityId: studentId,
    summary: `시트에서 학생 메모 작성`,
    metadata: { studentId, type, isImportant },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/memos");
}

export async function addMemo(formData: FormData) {
  return createMemo(formData);
}

export async function createStudentMemo(formData: FormData) {
  return createMemo(formData);
}

export async function addStudentMemo(formData: FormData) {
  return createMemo(formData);
}

export async function updateStudentMemo(formData: FormData) {
  const user = await requireUser();

  const memoId = text(formData, "memoId");
  const type = enumValue(text(formData, "type"), MEMO_TYPES, MemoType.GENERAL);
  const content = text(formData, "content");
  const isImportant = formData.get("isImportant") === "on";
  const fallback = backPath(formData, "/students");

  if (!memoId || !content) {
    throw new Error("수정할 메모 내용을 확인해 주세요.");
  }

  const memo = await prisma.studentMemo.findUnique({
    where: { id: memoId },
    include: { student: { select: { id: true, academyId: true } } },
  });

  if (!memo || memo.student.academyId !== user.academyId) {
    throw new Error("수정할 수 없는 메모입니다.");
  }

  await prisma.studentMemo.update({
    where: { id: memoId },
    data: { type, content, isImportant },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "StudentMemo",
    entityId: memoId,
    summary: `학생 메모 수정`,
    metadata: { studentId: memo.studentId, type, isImportant },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${memo.studentId}`);
  revalidatePath("/memos");

  redirect(fallback);
}

export async function toggleStudentMemoImportant(formData: FormData) {
  const user = await requireUser();

  const memoId = text(formData, "memoId");
  const fallback = backPath(formData, "/students");

  if (!memoId) {
    throw new Error("고정할 메모를 확인해 주세요.");
  }

  const memo = await prisma.studentMemo.findUnique({
    where: { id: memoId },
    include: { student: { select: { id: true, academyId: true } } },
  });

  if (!memo || memo.student.academyId !== user.academyId) {
    throw new Error("수정할 수 없는 메모입니다.");
  }

  await prisma.studentMemo.update({
    where: { id: memoId },
    data: { isImportant: !memo.isImportant },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${memo.studentId}`);
  revalidatePath("/memos");

  redirect(fallback);
}

export async function createCounselingRecord(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const title = text(formData, "title") || "상담";
  const content = text(formData, "content");
  const status = detailStatusValue(text(formData, "status"), "DONE");

  if (!studentId || !date || !content) {
    throw new Error("상담 날짜와 내용을 입력해 주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.counselingRecord.create({
    data: {
      academyId: user.academyId,
      studentId,
      ownerId: user.id,
      date,
      title,
      content,
      status,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "CounselingRecord",
    entityId: studentId,
    summary: `상담 기록 추가: ${title}`,
    metadata: { studentId, date, status },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function createClinicRecord(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const title = text(formData, "title");
  const content = nullableText(formData, "content");
  const status = detailStatusValue(text(formData, "status"), "TODO");

  if (!studentId || !date || !title) {
    throw new Error("클리닉 날짜와 제목을 입력해 주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.clinicRecord.create({
    data: {
      academyId: user.academyId,
      studentId,
      ownerId: user.id,
      date,
      title,
      content,
      status,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "ClinicRecord",
    entityId: studentId,
    summary: `클리닉 기록 추가: ${title}`,
    metadata: { studentId, date, status },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function createQuestionRecord(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const date = text(formData, "date");
  const subject = nullableText(formData, "subject");
  const content = text(formData, "content");
  const answer = nullableText(formData, "answer");
  const status = detailStatusValue(text(formData, "status"), answer ? "ANSWERED" : "OPEN");

  if (!studentId || !date || !content) {
    throw new Error("질문 날짜와 내용을 입력해 주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.questionRecord.create({
    data: {
      academyId: user.academyId,
      studentId,
      ownerId: user.id,
      date,
      subject,
      content,
      answer,
      status,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "QuestionRecord",
    entityId: studentId,
    summary: `질문 기록 추가`,
    metadata: { studentId, date, subject, status },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function createSchoolScoreRecord(formData: FormData) {
  const user = await requireUser();

  const studentId = text(formData, "studentId");
  const term = text(formData, "term");
  const examType = text(formData, "examType");
  const subject = text(formData, "subject");
  const date = nullableText(formData, "date");
  const score = decimalValue(formData, "score");
  const grade = nullableText(formData, "grade");
  const memo = nullableText(formData, "memo");

  if (!studentId || !term || !examType || !subject) {
    throw new Error("학교 성적의 학기, 시험, 과목을 입력해 주세요.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: user.academyId },
    select: { id: true },
  });

  if (!student) {
    throw new Error("학생을 찾을 수 없습니다.");
  }

  await prisma.schoolScoreRecord.create({
    data: {
      academyId: user.academyId,
      studentId,
      term,
      examType,
      subject,
      date,
      score,
      grade,
      memo,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "SchoolScoreRecord",
    entityId: studentId,
    summary: `학교 성적 추가: ${term} / ${examType} / ${subject}`,
    metadata: { studentId, date, score, grade },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function deleteMemo(formData: FormData) {
  const user = await requireUser();

  const memoId = text(formData, "memoId") || text(formData, "id");
  const fallback = backPath(formData, "/memos");

  if (!memoId) {
    throw new Error("삭제할 메모가 없습니다.");
  }

  const memo = await prisma.studentMemo.findUnique({
    where: { id: memoId },
    include: {
      student: {
        select: {
          id: true,
          academyId: true,
        },
      },
    },
  });

  if (!memo || memo.student.academyId !== user.academyId) {
    throw new Error("삭제할 수 없는 메모입니다.");
  }

  await prisma.studentMemo.delete({ where: { id: memoId } });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "StudentMemo",
    entityId: memoId,
    summary: `학생 메모 삭제`,
    metadata: { studentId: memo.studentId },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${memo.studentId}`);
  revalidatePath("/memos");

  redirect(fallback);
}
