"use server";

import { bulkAttendance as bulkAttendanceBase, bulkAssignment as bulkAssignmentBase, bulkStudentAssistant as bulkStudentAssistantBase, bulkStudentClassGroup as bulkStudentClassGroupBase, deleteStudentFromSheet as deleteStudentFromSheetBase, deleteStudentsFromSheet as deleteStudentsFromSheetBase, saveClassLessonConfig as saveClassLessonConfigBase, updateAssignment as updateAssignmentBase, updateAttendance as updateAttendanceBase, updateScore as updateScoreBase, updateStudentClassGroup as updateStudentClassGroupBase, updateStudentLessonCells as updateStudentLessonCellsBase, updateStudentSheetCell as updateStudentSheetCellBase, updateStudentSheetCustomCell as updateStudentSheetCustomCellBase, updateStudentSheetCustomCells as updateStudentSheetCustomCellsBase, updateStudentSheetCustomColumns as updateStudentSheetCustomColumnsBase, updateStudentSheetOptions as updateStudentSheetOptionsBase } from "@/features/students/actions/studentActions";

export async function bulkAttendance(formData: FormData) {
  return bulkAttendanceBase(formData);
}

export async function bulkAssignment(formData: FormData) {
  return bulkAssignmentBase(formData);
}

export async function bulkStudentAssistant(formData: FormData) {
  return bulkStudentAssistantBase(formData);
}

export async function bulkStudentClassGroup(formData: FormData) {
  return bulkStudentClassGroupBase(formData);
}

export async function deleteStudentFromSheet(formData: FormData) {
  return deleteStudentFromSheetBase(formData);
}

export async function deleteStudentsFromSheet(formData: FormData) {
  return deleteStudentsFromSheetBase(formData);
}

export async function saveClassLessonConfig(formData: FormData) {
  return saveClassLessonConfigBase(formData);
}

export async function updateAssignment(formData: FormData) {
  return updateAssignmentBase(formData);
}

export async function updateAttendance(formData: FormData) {
  return updateAttendanceBase(formData);
}

export async function updateScore(formData: FormData) {
  return updateScoreBase(formData);
}

export async function updateStudentClassGroup(formData: FormData) {
  return updateStudentClassGroupBase(formData);
}

export async function updateStudentLessonCells(formData: FormData) {
  return updateStudentLessonCellsBase(formData);
}

export async function updateStudentSheetCell(formData: FormData) {
  return updateStudentSheetCellBase(formData);
}

export async function updateStudentSheetCustomCell(formData: FormData) {
  return updateStudentSheetCustomCellBase(formData);
}

export async function updateStudentSheetCustomCells(formData: FormData) {
  return updateStudentSheetCustomCellsBase(formData);
}

export async function updateStudentSheetCustomColumns(formData: FormData) {
  return updateStudentSheetCustomColumnsBase(formData);
}

export async function updateStudentSheetOptions(formData: FormData) {
  return updateStudentSheetOptionsBase(formData);
}
