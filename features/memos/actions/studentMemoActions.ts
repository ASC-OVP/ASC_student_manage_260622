"use server";

import { bulkStudentMemoAction as bulkStudentMemoActionBase } from "@/features/memos/actions/memoActions";

export async function bulkStudentMemoAction(formData: FormData) {
  return bulkStudentMemoActionBase(formData);
}
