"use server";

import { reviewTaskAction as reviewTaskActionBase, startTaskAction as startTaskActionBase, submitTaskAction as submitTaskActionBase, updateTaskAssigneesAction as updateTaskAssigneesActionBase, updateTaskChecklistItemAction as updateTaskChecklistItemActionBase, updateTaskColorAction as updateTaskColorActionBase, updateTaskStatus as updateTaskStatusBase, updateTaskStatusAction as updateTaskStatusActionBase } from "@/features/tasks/actions/taskActions";

export async function reviewTaskAction(formData: FormData) {
  return reviewTaskActionBase(formData);
}

export async function startTaskAction(formData: FormData) {
  return startTaskActionBase(formData);
}

export async function submitTaskAction(formData: FormData) {
  return submitTaskActionBase(formData);
}

export async function updateTaskAssigneesAction(formData: FormData) {
  return updateTaskAssigneesActionBase(formData);
}

export async function updateTaskChecklistItemAction(formData: FormData) {
  return updateTaskChecklistItemActionBase(formData);
}

export async function updateTaskColorAction(formData: FormData) {
  return updateTaskColorActionBase(formData);
}

export async function updateTaskStatus(formData: FormData) {
  return updateTaskStatusBase(formData);
}

export async function updateTaskStatusAction(formData: FormData) {
  return updateTaskStatusActionBase(formData);
}
