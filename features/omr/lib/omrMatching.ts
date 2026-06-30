
import { prisma } from "@/lib/prisma";
import { phoneLastDigits } from "@/lib/phone";
import { OMR_UPLOAD_STATUSES, PHONE_RECOGNIZE_STATUSES } from "@/features/omr/lib/omrStatus";

export function phoneLast8(value?: string | null) {
  return phoneLastDigits(value, 8) || null;
}

export function normalizePhoneRecognizeStatus(status?: string | null, last8?: string | null) {
  if (status === PHONE_RECOGNIZE_STATUSES.OK) return PHONE_RECOGNIZE_STATUSES.OK;
  if (status === PHONE_RECOGNIZE_STATUSES.LOW_CONFIDENCE) return PHONE_RECOGNIZE_STATUSES.LOW_CONFIDENCE;
  if (status === PHONE_RECOGNIZE_STATUSES.MANUAL) return PHONE_RECOGNIZE_STATUSES.MANUAL;
  if (status === PHONE_RECOGNIZE_STATUSES.FAILED) return PHONE_RECOGNIZE_STATUSES.FAILED;
  return last8 ? PHONE_RECOGNIZE_STATUSES.OK : PHONE_RECOGNIZE_STATUSES.FAILED;
}

export async function matchStudentByPhoneLast8(academyId: string, last8: string | null, manualStudentId?: string) {
  if (manualStudentId) {
    const student = await prisma.student.findFirst({
      where: { id: manualStudentId, academyId },
      select: { id: true },
    });
    return {
      studentId: student?.id ?? null,
      matchStatus: student ? OMR_UPLOAD_STATUSES.MANUAL : OMR_UPLOAD_STATUSES.NOT_FOUND,
    };
  }

  if (!last8) {
    return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.NEEDS_PHONE };
  }

  const students = await prisma.student.findMany({
    where: { academyId },
    select: { id: true, phone: true, parentPhone: true },
  });
  const matches = students.filter((student) => phoneLast8(student.phone) === last8 || phoneLast8(student.parentPhone) === last8);

  if (matches.length === 1) {
    return { studentId: matches[0].id, matchStatus: OMR_UPLOAD_STATUSES.MATCHED };
  }

  if (matches.length > 1) {
    return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.MULTIPLE_MATCHES };
  }

  return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.NOT_FOUND };
}
