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

/**
 * WhatsApp as stored and linked: 10 or 11 digits with the area code (DDD), no country code.
 * Returns null when the number can't be dialled (missing DDD, too few digits).
 */
export function normalizeWhatsAppBR(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0(?=\d{10,11}$)/, '').replace(/^55(?=\d{10,11}$)/, '');
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export const WHATSAPP_HINT = 'Informe o WhatsApp com DDD, por exemplo (86) 99900-1122.';

/** Tidies a WhatsApp field into the format above when the person leaves it. */
export function bindPhoneFormatting(input) {
  input?.addEventListener('blur', () => {
    input.value = formatPhoneBR(input.value);
  });
}
