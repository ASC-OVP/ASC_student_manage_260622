"use server";

import { saveClassLessonConfig as saveClassLessonConfigBase, updateStudentLessonCells as updateStudentLessonCellsBase } from "@/features/students/actions/studentActions";

export async function saveClassLessonConfig(formData: FormData) {
  return saveClassLessonConfigBase(formData);
}

export async function updateStudentLessonCells(formData: FormData) {
  return updateStudentLessonCellsBase(formData);
}
