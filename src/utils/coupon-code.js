/** Codes are shown as ABCD-2345; sellers may type them without the hyphen or in lower case. */
export function getCouponCodeCandidates(input) {
  const compact = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const candidates = new Set([compact]);
  if (compact.length === 8) candidates.add(`${compact.slice(0, 4)}-${compact.slice(4)}`);
  return [...candidates].filter(Boolean);
}
