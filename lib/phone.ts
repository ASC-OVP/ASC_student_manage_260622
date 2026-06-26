const MOBILE_PREFIXES = new Set(["010", "011", "016", "017", "018", "019"]);

export function normalizePhoneNumber(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneLastDigits(value?: string | null, count = 8) {
  const digits = normalizePhoneNumber(value);
  return digits.length >= count ? digits.slice(-count) : "";
}

export function isSamePhoneNumber(a?: string | null, b?: string | null) {
  const left = normalizePhoneNumber(a);
  const right = normalizePhoneNumber(b);
  return Boolean(left && right && left === right);
}

export function formatPhoneNumber(value?: string | null) {
  const raw = String(value ?? "").trim();
  const digits = normalizePhoneNumber(raw);
  if (!digits) return raw;
  if (digits.length < 7) return digits;
  if (digits.length > 11) return raw;

  if (digits.startsWith("02")) {
    return formatSeoulNumber(digits);
  }

  const prefix = digits.slice(0, 3);
  if (MOBILE_PREFIXES.has(prefix)) {
    return formatThreeDigitAreaNumber(digits);
  }

  if (digits.startsWith("0")) {
    return formatThreeDigitAreaNumber(digits);
  }

  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return digits;
}

export function formatPhoneInput(value?: string | null) {
  return formatPhoneNumber(value);
}

export function formatPhoneLast8(value?: string | null) {
  const digits = phoneLastDigits(value, 8);
  return digits ? `${digits.slice(0, 4)}-${digits.slice(4)}` : "";
}

function formatSeoulNumber(digits: string) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
}

function formatThreeDigitAreaNumber(digits: string) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
