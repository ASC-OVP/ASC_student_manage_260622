import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";

function encryptionSecret() {
  return process.env.APP_ENCRYPTION_KEY?.trim() || "";
}

function keyBuffer() {
  const secret = encryptionSecret();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function hasAppEncryptionKey() {
  return Boolean(encryptionSecret());
}

export function encryptSecret(value: string) {
  const key = keyBuffer();
  if (!key) throw new Error("APP_ENCRYPTION_KEY is required to store SMS provider credentials.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value?: string | null) {
  if (!value) return "";
  const key = keyBuffer();
  if (!key) throw new Error("APP_ENCRYPTION_KEY is required to read stored SMS provider credentials.");
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Unsupported encrypted secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8");
}

export function maskSecret(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 2)}******`;
  return `${raw.slice(0, 8)}********${raw.slice(-4)}`;
}

export function jsonStringifySafe(value: unknown, maxLength = 4000) {
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return null;
  }
}
