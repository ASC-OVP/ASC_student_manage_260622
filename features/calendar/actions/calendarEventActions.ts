"use server";

import { saveCalendarEventMemoAction as saveCalendarEventMemoActionBase } from "@/features/calendar/actions/calendarMemoActions";

export async function saveCalendarEventMemoAction(formData: FormData) { return saveCalendarEventMemoActionBase(formData); }
