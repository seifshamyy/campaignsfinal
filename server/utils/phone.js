/**
 * Normalize a phone number to Meta's expected format:
 * country code + number, digits only, no + prefix.
 */
export function normalizePhone(input, defaultCountryCode = "966") {
  if (input === null || input === undefined) return null;

  // Handle Excel scientific notation: 9.67E+11 → 966501234567
  const num = Number(input);
  if (!isNaN(num) && Math.abs(num) > 1e9) {
    input = Math.round(num).toString();
  }

  let phone = String(input).replace(/\D/g, "");

  if (!phone) return null;

  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  } else if (phone.startsWith("0") && phone.length >= 10) {
    phone = defaultCountryCode + phone.slice(1);
  } else if (phone.length <= 10) {
    phone = defaultCountryCode + phone;
  }
  // Already has country code (11+ digits) → keep as is

  return phone;
}

/**
 * Validate a normalized phone number.
 */
export function validatePhone(phone) {
  if (!phone) return { valid: false, error: "Empty phone number" };
  if (phone.length < 10) return { valid: false, error: "Too short (min 10 digits)" };
  if (phone.length > 15) return { valid: false, error: "Too long (max 15 digits, E.164)" };
  return { valid: true };
}
