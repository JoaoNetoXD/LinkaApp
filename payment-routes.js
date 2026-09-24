// Routes that only exist for in-platform payments (Mercado Pago). In the
// coupon-only phase server.js answers them with 410 unless PAYMENTS_ENABLED=true.
const PAYMENT_ROUTE_PATTERNS = [
  /^\/api\/mercadopago(\/|$)/,
  /^\/api\/pix$/,
  /^\/api\/payment\//,
  /^\/api\/preference$/,
  /^\/api\/webhook$/,
  /^\/api\/products\/[^/]+\/payment-ready$/,
  /^\/api\/seller\/[^/]+\/payments$/,
];

export function isPaymentRoute(path = '') {
  return PAYMENT_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}
