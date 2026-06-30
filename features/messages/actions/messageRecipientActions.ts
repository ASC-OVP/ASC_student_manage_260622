"use server";

import { previewMessageRecipientsAction as previewMessageRecipientsActionBase } from "@/features/messages/actions/messageActions";

export async function previewMessageRecipientsAction(formData: FormData) {
  return previewMessageRecipientsActionBase(formData);
}
