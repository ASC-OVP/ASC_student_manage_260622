"use server";

import { createStickyMemoAction as createStickyMemoActionBase, deleteStickyMemoAction as deleteStickyMemoActionBase, updateStickyMemoAction as updateStickyMemoActionBase } from "@/features/memos/actions/memoActions";

export async function createStickyMemoAction(formData: FormData) {
  return createStickyMemoActionBase(formData);
}

export async function deleteStickyMemoAction(formData: FormData) {
  return deleteStickyMemoActionBase(formData);
}

export async function updateStickyMemoAction(formData: FormData) {
  return updateStickyMemoActionBase(formData);
}
