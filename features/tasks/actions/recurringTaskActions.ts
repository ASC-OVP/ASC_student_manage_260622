"use server";

import {
  createRecurringTaskAction as createRecurringTaskActionBase,
  generateRecurringTasksAction as generateRecurringTasksActionBase,
  toggleRecurringTaskAction as toggleRecurringTaskActionBase,
  updateRecurringTaskAction as updateRecurringTaskActionBase,
} from "@/features/tasks/actions/taskActions";

export async function createRecurringTaskAction(formData: FormData) { return createRecurringTaskActionBase(formData); }
export async function updateRecurringTaskAction(formData: FormData) { return updateRecurringTaskActionBase(formData); }
export async function toggleRecurringTaskAction(formData: FormData) { return toggleRecurringTaskActionBase(formData); }
export async function generateRecurringTasksAction() { return generateRecurringTasksActionBase(); }
