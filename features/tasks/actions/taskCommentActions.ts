"use server";

import { addTaskComment as addTaskCommentBase, createTaskComment as createTaskCommentBase, createTaskCommentAction as createTaskCommentActionBase } from "@/features/tasks/actions/taskActions";

export async function addTaskComment(formData: FormData) {
  return addTaskCommentBase(formData);
}

export async function createTaskComment(formData: FormData) {
  return createTaskCommentBase(formData);
}

export async function createTaskCommentAction(formData: FormData) {
  return createTaskCommentActionBase(formData);
}
