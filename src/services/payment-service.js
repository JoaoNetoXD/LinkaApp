/**
 * Payment Service — Linka (Real Mercado Pago Integration)
 */

import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a Pix payment
 */
export async function createPixPayment(product, couponCode, buyer) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/pix`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId: product.id, couponCode })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao gerar Pix.');
    
    // Convert base64 qr to img tag for display
    const qrCodeSVG = `<img src="data:image/jpeg;base64,${data.payment.qrCodeBase64}" class="qr-code-image" alt="QR Code Pix" />`;
    
    return {
      ...data.payment,
      qrCodeSVG,
      qrCodeString: data.payment.pixCode || data.payment.qrCodeString || '',
      originalAmount: product.originalPrice,
      discount: product.discount,
      couponCode,
    };
  } catch (err) {
    throw new Error(err.message || 'Erro ao gerar Pix.');
  }
}

/**
 * Create a Checkout Pro Preference (for Credit Card)
 */
export async function createCheckoutPreference(product, couponCode, buyer) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/preference`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId: product.id, couponCode })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao gerar checkout.');
    
    const checkoutUrl = data.checkoutUrl || data.initPoint;
    if (!checkoutUrl) throw new Error('Mercado Pago nao retornou o link de checkout.');
    return checkoutUrl;
  } catch (err) {
    throw new Error(err.message || 'Erro ao gerar checkout.');
  }
}

export async function checkProductPaymentReady(productId) {
  try {
    const response = await fetch(`${API_URL}/products/${productId}/payment-ready`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return {
        ready: false,
        code: data.code || 'PAYMENT_READY_ERROR',
        message: data.message || data.error || 'Nao foi possivel verificar o pagamento.',
      };
    }
    return data;
  } catch (err) {
    return {
      ready: false,
      code: 'PAYMENT_READY_ERROR',
      message: err.message || 'Nao foi possivel verificar o pagamento.',
    };
  }
}

/**
 * Check payment status (polls backend)
 */
export async function checkPaymentStatus(paymentId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/payment/${paymentId}`, { headers });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao verificar pagamento.');
    return data.payment;
  } catch (err) {
    throw new Error(err.message || 'Erro ao verificar pagamento.');
  }
}

/**
 * Get all payments for seller (Dashboard)
 */
export async function getSellerPayments(sellerId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/seller/${sellerId}/payments`, { headers });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao carregar vendas.');
    return data.payments;
  } catch (err) {
    throw new Error(err.message || 'Erro ao carregar vendas.');
  }
}

/**
 * Get payment statistics for seller
 */
export async function getPaymentStats(sellerId) {
  const allPayments = await getSellerPayments(sellerId);
  const paid = allPayments.filter(p => p.status === 'paid');
  const pending = allPayments.filter(p => p.status === 'pending');

  const PLATFORM_COMMISSION_RATE = 0;

  const totalGross = paid.reduce((sum, p) => sum + p.amount, 0);
  const totalFees = paid.reduce((sum, p) => sum + (p.platformFee || 0), 0);
  const totalNet = paid.reduce((sum, p) => sum + (p.sellerAmount || p.amount), 0);

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

export async function getMercadoPagoStatus() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/mercadopago/status`, { headers });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao consultar Mercado Pago.');
  return data;
}

export async function startMercadoPagoOAuth() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/mercadopago/oauth/start`, {
    method: 'POST',
    headers,
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao conectar Mercado Pago.');
  return data.url;
}

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
};
