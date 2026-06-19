import { prisma } from "@/lib/prisma";
import {
  defaultAssignmentSheetOptions,
  defaultAttendanceSheetOptions,
  normalizeSheetOptions,
  studentSheetOptionSettingKeys,
} from "@/lib/studentSheetOptions";
import {
  normalizeCustomCellValues,
  normalizeCustomColumns,
  studentSheetCustomSettingKeys,
} from "@/lib/studentSheetCustomColumns";

type SettingRow = {
  key: string;
  value: string;
};

export async function getStudentSheetOptionSettings(academyId: string) {
  const rows = await prisma.$queryRaw<SettingRow[]>`
    SELECT key, value
    FROM AcademySetting
    WHERE academyId = ${academyId}
      AND key IN (${studentSheetOptionSettingKeys.attendance}, ${studentSheetOptionSettingKeys.assignment})
  `;
  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return {
    attendanceOptions: normalizeSheetOptions(
      parseJson(settings.get(studentSheetOptionSettingKeys.attendance)),
      defaultAttendanceSheetOptions
    ),
    assignmentOptions: normalizeSheetOptions(
      parseJson(settings.get(studentSheetOptionSettingKeys.assignment)),
      defaultAssignmentSheetOptions
    ),
  };
}

export async function getStudentSheetCustomSettings(academyId: string) {
  const rows = await prisma.$queryRaw<SettingRow[]>`
    SELECT key, value
    FROM AcademySetting
    WHERE academyId = ${academyId}
      AND key IN (${studentSheetCustomSettingKeys.columns}, ${studentSheetCustomSettingKeys.values})
  `;
  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return {
    customColumns: normalizeCustomColumns(parseJson(settings.get(studentSheetCustomSettingKeys.columns))),
    customValues: normalizeCustomCellValues(parseJson(settings.get(studentSheetCustomSettingKeys.values))),
  };
}

function parseJson(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
