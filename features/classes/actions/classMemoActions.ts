"use server";

import { createClassMemoAction as createClassMemoActionBase, deleteClassMemoAction as deleteClassMemoActionBase } from "@/features/classes/actions/classActions";

export async function createClassMemoAction(formData: FormData) {
  return createClassMemoActionBase(formData);
}

export async function deleteClassMemoAction(formData: FormData) {
  return deleteClassMemoActionBase(formData);
}
