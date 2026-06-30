"use server";

import { saveAssistantWorkNoteAction as saveAssistantWorkNoteActionBase, updatePayrollSettlementAction as updatePayrollSettlementActionBase } from "@/features/work/actions/workShiftActions";

export async function saveAssistantWorkNoteAction(formData: FormData) {
  return saveAssistantWorkNoteActionBase(formData);
}

export async function updatePayrollSettlementAction(formData: FormData) {
  return updatePayrollSettlementActionBase(formData);
}
