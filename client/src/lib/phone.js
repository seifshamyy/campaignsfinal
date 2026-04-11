export function normalizePhone(input, defaultCountryCode = "966") {
  if (input === null || input === undefined) return null;

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

  return phone;
}

export function validatePhone(phone) {
  if (!phone) return { valid: false, error: "Empty" };
  if (phone.length < 10) return { valid: false, error: "Too short" };
  if (phone.length > 15) return { valid: false, error: "Too long" };
  return { valid: true };
}
