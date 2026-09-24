/**
 * Coupon Service — Empreende iCEV (Supabase)
 * Students retrieve a personal discount code (claim_coupon RPC) and buy
 * directly from the company; sellers validate the code when it is used.
 */
import { supabase } from '../lib/supabase.js';
import { sellerCoupons as mockSellerCoupons } from '../data/mock.js';
import { getCouponCodeCandidates } from '../utils/coupon-code.js';

const USE_MOCKS = import.meta.env.DEV;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Coupons retrieved while previewing locally without a reachable Supabase.
const devClaimedCoupons = [];

const CLAIM_ERRORS = {
  AUTH_REQUIRED: 'Entre com seu e-mail do iCEV para retirar o cupom.',
  INSTITUTION_REQUIRED: 'Sua conta não está vinculada ao iCEV. Entre com seu e-mail institucional.',
  OFFER_NOT_FOUND: 'Esta oferta não existe mais.',
  OFFER_UNAVAILABLE: 'Esta oferta não está mais disponível.',
  OTHER_INSTITUTION: 'Esta oferta é de outra instituição.',
  OWN_OFFER: 'Esta oferta é da sua empresa. Compartilhe com seus colegas.',
  SOLD_OUT: 'Os cupons desta oferta acabaram.',
};

function getClaimErrorMessage(error) {
  const message = String(error?.message || '');
  const known = Object.keys(CLAIM_ERRORS).find((key) => message.includes(key));
  if (known) return { code: known, message: CLAIM_ERRORS[known] };
  if (error?.code === 'PGRST202' || /claim_coupon/.test(message)) {
    console.error('claim_coupon RPC missing: run scripts/coupon-claim-migration.sql in Supabase.');
    return { code: 'NOT_CONFIGURED', message: 'A retirada de cupons ainda não foi ativada. Avise a equipe Empreende iCEV.' };
  }
  return { code: 'UNKNOWN', message: 'Não foi possível retirar o cupom agora. Tente de novo em instantes.' };
}

function generateDevCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/**
 * Retrieve (or re-open) the student's coupon for an offer.
 * `product` is the offer shown on screen; it fills in display fields the RPC does not return.
 */
export async function claimCoupon(product) {
  const productId = product?.id;
  const display = {
    product: { title: product?.title, discount_price: product?.discountPrice, original_price: product?.originalPrice, discount: product?.discount },
    seller: { name: product?.seller?.name, whatsapp: product?.seller?.whatsapp },
  };

  try {
    const { data, error } = await supabase.rpc('claim_coupon', { p_product_id: productId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { success: true, coupon: transformCoupon({ ...row, ...display }) };
  } catch (err) {
    const isNetworkFailure = /fetch|network|Failed to fetch/i.test(String(err?.message || ''));
    if (USE_MOCKS && isNetworkFailure) {
      console.warn('claimCoupon: Supabase unavailable, issuing a local preview coupon.');
      const existing = devClaimedCoupons.find((c) => c.product_id === productId && c.status === 'active');
      const hours = Number(product?.couponValidHours) || 24;
      const row = existing || {
        id: `dev-${Date.now()}`,
        code: generateDevCode(),
        product_id: productId,
        seller_id: product?.seller?.id || null,
        status: 'active',
        created_at: new Date().toISOString(),
        valid_until: new Date(Date.now() + hours * 3600000).toISOString(),
        ...display,
      };
      if (!existing) devClaimedCoupons.unshift(row);
      return { success: true, coupon: transformCoupon(row) };
    }
    const { code, message } = getClaimErrorMessage(err);
    return { success: false, code, error: message };
  }
}

/** Get coupons for a buyer */
export async function getBuyerCoupons(buyerId) {
  try {
    const { data, error } = await supabase.from('coupons')
      .select(`*, product:products!product_id (title, discount_price, original_price, discount), seller:profiles!seller_id (name, whatsapp)`)
      .eq('buyer_id', buyerId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformCoupon);
  } catch (err) {
    console.warn('getBuyerCoupons: unavailable.', err.message);
    if (USE_MOCKS) return devClaimedCoupons.map(transformCoupon);
    // An empty wallet would look like the student lost their codes; let the page say it failed.
    throw err;
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
    throw err;
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
    const candidates = getCouponCodeCandidates(code);
    if (!candidates.length) return { valid: false, error: 'Digite o código do cupom.' };
    const { data, error } = await supabase.from('coupons')
      .select(`*, product:products!product_id (title), buyer:profiles!buyer_id (name)`)
      .in('code', candidates).maybeSingle();

    if (error && USE_MOCKS) return validateDevCoupon(candidates);
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

// Local preview without Supabase: check the code against the mock company wallet.
function validateDevCoupon(candidates) {
  const coupon = mockSellerCoupons.find((c) => candidates.includes(c.code));
  if (!coupon) return { valid: false, error: 'Cupom não encontrado.' };
  if (coupon.status === 'used') return { valid: false, error: 'Cupom já foi utilizado.', coupon };
  if (coupon.status === 'expired') return { valid: false, error: 'Cupom expirado.', coupon };
  return { valid: true, coupon: { id: `dev-${coupon.code}`, ...coupon } };
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
    // product_title is kept on the coupon (scripts/integrity-migration.sql): the offer may be edited or removed.
    product: c.product?.title || c.product_title || 'Oferta',
    discountPrice: c.product?.discount_price,
    originalPrice: c.product?.original_price,
    discount: c.product?.discount,
    seller: c.seller?.name || 'Empresa',
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
    // product_title is kept on the coupon (scripts/integrity-migration.sql): the offer may be edited or removed.
    product: c.product?.title || c.product_title || 'Oferta',
    buyer: c.buyer?.name || 'Aluno',
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
