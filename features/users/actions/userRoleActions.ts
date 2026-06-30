"use server";

import { createUserAction as createUserActionBase, deleteUserAction as deleteUserActionBase } from "@/features/users/actions/userActions";

export async function createUserAction(formData: FormData) {
  return createUserActionBase(formData);
}

export async function deleteUserAction(formData: FormData) {
  return deleteUserActionBase(formData);
}
