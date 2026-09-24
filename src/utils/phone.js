/**
 * Brazilian phone display: "86999001122" or "5586999001122" -> "(86) 99900-1122".
 * Anything that isn't a 10 or 11 digit number (after an optional 55) is returned as typed.
 */
export function formatPhoneBR(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

/** Tidies a WhatsApp field into the format above when the person leaves it. */
export function bindPhoneFormatting(input) {
  input?.addEventListener('blur', () => {
    input.value = formatPhoneBR(input.value);
  });
}
