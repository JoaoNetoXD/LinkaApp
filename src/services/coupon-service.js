/**
 * Coupon Service — Linka (Supabase)
 * Handles coupon generation, validation, and management.
 */
import { supabase } from '../lib/supabase.js';
import { coupons as mockBuyerCoupons, sellerCoupons as mockSellerCoupons } from '../data/mock.js';

const USE_MOCKS = import.meta.env.DEV;

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

/** Create a new coupon after payment */
export async function createCoupon({ productId, buyerId, sellerId, paymentId, validHours = 24 }) {
  const code = generateCode();
  const validUntil = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase.from('coupons').insert({
      code, product_id: productId, buyer_id: buyerId, seller_id: sellerId,
      payment_id: paymentId, status: 'active', valid_until: validUntil,
    }).select(`*, product:products!product_id (title), seller:profiles!seller_id (name), buyer:profiles!buyer_id (name)`).single();

    if (error) throw error;
    return { success: true, coupon: transformCoupon(data) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('createCoupon: Supabase unavailable, using mock.', err.message);
      return {
        success: true,
        coupon: { code, productId, status: 'active', createdAt: new Date().toLocaleString(), validUntil: new Date(Date.now() + validHours * 3600000).toLocaleString() }
      };
    }
    return { success: false, error: err.message };
  }
}

/** Get coupons for a buyer */
export async function getBuyerCoupons(buyerId) {
  try {
    const { data, error } = await supabase.from('coupons')
      .select(`*, product:products!product_id (title, discount_price, original_price), seller:profiles!seller_id (name, whatsapp)`)
      .eq('buyer_id', buyerId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformCoupon);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getBuyerCoupons: using mock data.', err.message);
      return mockBuyerCoupons;
    }
    return [];
  }
}

/** Get coupons received by a seller */
export async function getSellerCoupons(sellerId) {
  try {
    const { data, error } = await supabase.from('coupons')
      .select(`*, product:products!product_id (title), buyer:profiles!buyer_id (name)`)
      .eq('seller_id', sellerId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformSellerCoupon);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getSellerCoupons: using mock data.', err.message);
      return mockSellerCoupons;
    }
    return [];
  }
}

/** Mark a coupon as used (seller action) */
export async function markCouponUsed(couponId) {
  try {
    const { data: currentCoupon, error: currentError } = await supabase.from('coupons')
      .select('id, status, valid_until, used_at')
      .eq('id', couponId)
      .single();

    if (currentError || !currentCoupon) {
      return { success: false, error: 'Cupom não encontrado.' };
    }
    if (currentCoupon.status === 'used' || currentCoupon.used_at) {
      return { success: false, error: 'Este cupom já foi utilizado.' };
    }
    if (currentCoupon.status === 'expired' || (currentCoupon.valid_until && new Date(currentCoupon.valid_until) < new Date())) {
      return { success: false, error: 'Este cupom está expirado.' };
    }

    const { data, error } = await supabase.from('coupons')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', couponId)
      .eq('status', 'active')
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return { success: false, error: 'Este cupom não está mais ativo.' };
      throw error;
    }
    return { success: true, coupon: data };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('markCouponUsed: Supabase unavailable.', err.message);
      return { success: true };
    }
    return { success: false, error: err.message };
  }
}

/** Validate a coupon by code (seller scans/types) */
export async function validateCoupon(code) {
  try {
    const { data, error } = await supabase.from('coupons')
      .select(`*, product:products!product_id (title), buyer:profiles!buyer_id (name)`)
      .eq('code', code.toUpperCase()).single();

    if (error || !data) return { valid: false, error: 'Cupom não encontrado.' };
    if (data.status === 'used') return { valid: false, error: 'Cupom já foi utilizado.', coupon: data };
    if (data.status === 'expired' || new Date(data.valid_until) < new Date()) {
      return { valid: false, error: 'Cupom expirado.', coupon: data };
    }
    return { valid: true, coupon: transformSellerCoupon(data) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('validateCoupon: Supabase unavailable.', err.message);
      return { valid: false, error: 'Erro ao validar cupom.' };
    }
    return { valid: false, error: 'Cupom não encontrado.' };
  }
}

/** Get coupon stats for a product */
export async function getProductCouponStats(productId) {
  try {
    const { data, error } = await supabase.from('coupons')
      .select('status').eq('product_id', productId);
    if (error) throw error;
    const total = data?.length || 0;
    const used = data?.filter(c => c.status === 'used').length || 0;
    const active = data?.filter(c => c.status === 'active').length || 0;
    return { total, used, active };
  } catch {
    return { total: 0, used: 0, active: 0 };
  }
}

/** Expire old coupons (could be called periodically) */
export async function expireOldCoupons() {
  try {
    await supabase.from('coupons')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('valid_until', new Date().toISOString());
  } catch (err) {
    console.warn('expireOldCoupons failed:', err.message);
  }
}

function transformCoupon(c) {
  const status = normalizeCouponStatus(c);
  return {
    id: c.id, code: c.code, productId: c.product_id,
    sellerId: c.seller_id,
    product: c.product?.title || 'Produto',
    seller: c.seller?.name || 'Vendedor',
    sellerWhatsapp: c.seller?.whatsapp,
    status,
    createdAt: formatDate(c.created_at),
    createdAtRaw: c.created_at,
    validUntil: formatDate(c.valid_until),
    usedAt: formatDate(c.used_at),
    usedAtRaw: c.used_at,
  };
}

function transformSellerCoupon(c) {
  const status = normalizeCouponStatus(c);
  return {
    id: c.id, code: c.code, productId: c.product_id,
    sellerId: c.seller_id,
    product: c.product?.title || 'Produto',
    buyer: c.buyer?.name || 'Comprador',
    status,
    createdAt: formatDate(c.created_at),
    createdAtRaw: c.created_at,
    validUntil: formatDate(c.valid_until),
    usedAt: formatDate(c.used_at),
    usedAtRaw: c.used_at,
  };
}

function normalizeCouponStatus(c) {
  if (c?.status === 'active' && c.valid_until && new Date(c.valid_until) < new Date()) {
    return 'expired';
  }
  return c?.status || 'active';
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
