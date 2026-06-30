"use server";

import { bulkStudentClassGroup as bulkStudentClassGroupBase, updateStudentClassGroup as updateStudentClassGroupBase } from "@/features/students/actions/studentActions";

export async function bulkStudentClassGroup(formData: FormData) {
  return bulkStudentClassGroupBase(formData);
}

export async function updateStudentClassGroup(formData: FormData) {
  return updateStudentClassGroupBase(formData);
}
