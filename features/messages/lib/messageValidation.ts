
export function validateMessageBody(body: string) {
  return body.trim().length > 0 ? null : "Message body is required.";
}
