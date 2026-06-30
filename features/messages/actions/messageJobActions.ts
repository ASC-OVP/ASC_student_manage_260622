"use server";

import {
  getMessageSettingsStatusAction as getMessageSettingsStatusActionBase,
  listMessageLogsAction as listMessageLogsActionBase,
  sendMessageJobAction as sendMessageJobActionBase,
} from "@/features/messages/actions/messageActions";

export async function getMessageSettingsStatusAction() { return getMessageSettingsStatusActionBase(); }
export async function listMessageLogsAction() { return listMessageLogsActionBase(); }
export async function sendMessageJobAction(formData: FormData) { return sendMessageJobActionBase(formData); }
