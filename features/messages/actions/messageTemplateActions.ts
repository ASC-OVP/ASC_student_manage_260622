"use server";

import {
  createMessageTemplateAction as createMessageTemplateActionBase,
  deleteMessageTemplateAction as deleteMessageTemplateActionBase,
  ensureDefaultMessageTemplatesAction as ensureDefaultMessageTemplatesActionBase,
  listMessageTemplatesAction as listMessageTemplatesActionBase,
  updateMessageTemplateAction as updateMessageTemplateActionBase,
} from "@/features/messages/actions/messageActions";

export async function ensureDefaultMessageTemplatesAction() { return ensureDefaultMessageTemplatesActionBase(); }
export async function listMessageTemplatesAction() { return listMessageTemplatesActionBase(); }
export async function createMessageTemplateAction(formData: FormData) { return createMessageTemplateActionBase(formData); }
export async function updateMessageTemplateAction(formData: FormData) { return updateMessageTemplateActionBase(formData); }
export async function deleteMessageTemplateAction(formData: FormData) { return deleteMessageTemplateActionBase(formData); }
