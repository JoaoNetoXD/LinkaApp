export function isValidPaymentReference(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
}

export function paymentMatchesIntent(payment, intent) {
  if (!payment || !intent?.external_reference || !intent?.amount) return false;
  if (payment.external_reference !== intent.external_reference) return false;
  if (payment.currency_id && payment.currency_id !== 'BRL') return false;
  const paidCents = Math.round(Number(payment.transaction_amount) * 100);
  const expectedCents = Math.round(Number(intent.amount) * 100);
  return Number.isSafeInteger(paidCents) && paidCents > 0 && paidCents === expectedCents;
}
