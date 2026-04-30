/**
 * Payment Service — Linka (Real Mercado Pago Integration)
 */

const API_URL = 'http://localhost:3000/api';

/**
 * Create a Pix payment
 */
export async function createPixPayment(product, couponCode, buyer) {
  try {
    const response = await fetch(`${API_URL}/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, buyer, couponCode })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    // Convert base64 qr to img tag for display
    const qrCodeSVG = `<img src="data:image/jpeg;base64,${data.payment.qrCodeBase64}" class="qr-code-image" alt="QR Code Pix" />`;
    
    return {
      ...data.payment,
      qrCodeSVG,
      originalAmount: product.originalPrice,
      discount: product.discount,
      couponCode,
    };
  } catch (err) {
    console.error("Payment creation failed:", err);
    throw err;
  }
}

/**
 * Create a Checkout Pro Preference (for Credit Card)
 */
export async function createCheckoutPreference(product, couponCode, buyer) {
  try {
    const response = await fetch(`${API_URL}/preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, buyer, couponCode })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    return data.initPoint;
  } catch (err) {
    console.error("Preference creation failed:", err);
    throw err;
  }
}

/**
 * Check payment status (polls backend)
 */
export async function checkPaymentStatus(paymentId) {
  try {
    const response = await fetch(`${API_URL}/payment/${paymentId}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.payment;
  } catch (err) {
    console.error("Payment check failed:", err);
    return null;
  }
}

/**
 * Get all payments for seller (Dashboard)
 */
export async function getSellerPayments(sellerId) {
  try {
    const response = await fetch(`${API_URL}/seller/${sellerId}/payments`);
    const data = await response.json();
    if (!data.success) return [];
    return data.payments;
  } catch (err) {
    console.error("Get seller payments failed:", err);
    return [];
  }
}

/**
 * Get payment statistics for seller
 */
export async function getPaymentStats(sellerId) {
  const allPayments = await getSellerPayments(sellerId);
  const paid = allPayments.filter(p => p.status === 'paid');
  const pending = allPayments.filter(p => p.status === 'pending');

  const PLATFORM_COMMISSION_RATE = 0.01;

  const totalGross = paid.reduce((sum, p) => sum + p.amount, 0);
  const totalFees = paid.reduce((sum, p) => sum + (p.platformFee || p.amount * PLATFORM_COMMISSION_RATE), 0);
  const totalNet = paid.reduce((sum, p) => sum + (p.sellerAmount || p.amount * (1 - PLATFORM_COMMISSION_RATE)), 0);

  return {
    totalReceived: Math.round(totalNet * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    totalPayments: allPayments.length,
    paidCount: paid.length,
    pendingCount: pending.length,
    commissionRate: PLATFORM_COMMISSION_RATE,
    conversionRate: allPayments.length > 0
      ? Math.round((paid.length / allPayments.length) * 100)
      : 0,
  };
}

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
};
