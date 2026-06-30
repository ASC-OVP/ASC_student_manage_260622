"use server";

import {
  addMemo as addMemoBase,
  addStudentMemo as addStudentMemoBase,
  createClinicRecord as createClinicRecordBase,
  createCounselingRecord as createCounselingRecordBase,
  createMemo as createMemoBase,
  createQuestionRecord as createQuestionRecordBase,
  createSchoolScoreRecord as createSchoolScoreRecordBase,
  createStudentMemo as createStudentMemoBase,
  createStudentMemoFromSheet as createStudentMemoFromSheetBase,
  deleteMemo as deleteMemoBase,
  toggleStudentMemoImportant as toggleStudentMemoImportantBase,
  updateStudentMemo as updateStudentMemoBase,
} from "@/features/students/actions/studentActions";

export async function addMemo(formData: FormData) { return addMemoBase(formData); }
export async function addStudentMemo(formData: FormData) { return addStudentMemoBase(formData); }
export async function createClinicRecord(formData: FormData) { return createClinicRecordBase(formData); }
export async function createCounselingRecord(formData: FormData) { return createCounselingRecordBase(formData); }
export async function createMemo(formData: FormData) { return createMemoBase(formData); }
export async function createQuestionRecord(formData: FormData) { return createQuestionRecordBase(formData); }
export async function createSchoolScoreRecord(formData: FormData) { return createSchoolScoreRecordBase(formData); }
export async function createStudentMemo(formData: FormData) { return createStudentMemoBase(formData); }
export async function createStudentMemoFromSheet(formData: FormData) { return createStudentMemoFromSheetBase(formData); }
export async function deleteMemo(formData: FormData) { return deleteMemoBase(formData); }
export async function toggleStudentMemoImportant(formData: FormData) { return toggleStudentMemoImportantBase(formData); }
export async function updateStudentMemo(formData: FormData) { return updateStudentMemoBase(formData); }
