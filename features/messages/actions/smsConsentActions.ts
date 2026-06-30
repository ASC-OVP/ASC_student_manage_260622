"use server";

export async function updateSmsConsentAction() {
  return { ok: true, handled: false, reason: "sms consent is stored on student phone metadata in the current schema" };
}
