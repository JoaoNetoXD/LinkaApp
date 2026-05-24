/**
 * Product Service — Linka (Supabase CRUD)
 * Full CRUD for products with Supabase integration and mock fallback.
 */

import { supabase } from '../lib/supabase.js';
import { products as mockProducts, sellerAds as mockSellerAds, categories as mockCategories } from '../data/mock.js';

const USE_MOCKS = import.meta.env.DEV;
const QUERY_TIMEOUT_MS = 3500;
const API_URL = import.meta.env.VITE_API_URL || '/api';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('AUTH_REQUIRED');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

function withTimeout(promise, ms = QUERY_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo limite ao consultar o Supabase.')), ms);
    }),
  ]);
}

/**
 * Fetch all active products (buyer vitrine)
 * @param {string} categoryId - optional filter by category
 * @param {string} search - optional search term
 * @param {string} institutionId - optional institution filter
 */
export async function getActiveProducts({ categoryId = 'all', search = '', institutionId = null } = {}) {
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        seller:profiles!seller_id (id, name, email, whatsapp, avatar, course, semester, verified)
      `)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
    }

    const { data, error } = await withTimeout(query);
    if (error) throw error;
    if ((!data || data.length === 0) && USE_MOCKS) {
      return filterMockProducts(mockProducts, categoryId, search);
    }
    return (data || []).map(transformProduct);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getActiveProducts: Supabase unavailable, using mock data.', err.message);
      return filterMockProducts(mockProducts, categoryId, search);
    }
    return [];
  }
}

/**
 * Fetch a single product by ID
 */
export async function getProductById(productId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        seller:profiles!seller_id (id, name, email, whatsapp, avatar, course, semester, verified)
      `)
      .eq('id', productId)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return transformProduct(data);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getProductById: Supabase unavailable, using mock data.', err.message);
      return mockProducts.find(p => p.id == productId) || null;
    }
    return null;
  }
}

/**
 * Get all products for a seller (all statuses)
 */
export async function getSellerProducts(sellerId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('seller_id', sellerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(transformProduct);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getSellerProducts: Supabase unavailable, using mock data.', err.message);
      return mockSellerAds;
    }
    return [];
  }
}

/**
 * Create a new product (seller submits ad)
 */
async function getCategoryDefaults(categoryId) {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('max_slots,duration_hours')
      .eq('id', categoryId)
      .maybeSingle();

    if (error) throw error;
    return data || {};
  } catch (error) {
    console.warn('Nao foi possivel carregar regras da categoria:', error.message);
    return {};
  }
}

export async function createProduct({ sellerId, title, description, categoryId, originalPrice, discount, images = [], whatsapp, institutionId = null }) {
  const discountPrice = Math.round(originalPrice * (1 - discount / 100) * 100) / 100;

  try {
    const categoryDefaults = await getCategoryDefaults(categoryId);
    if (whatsapp) {
      await supabase
        .from('profiles')
        .update({ whatsapp })
        .eq('id', sellerId);
    }

    const productData = {
      seller_id: sellerId,
      title,
      description,
      category_id: categoryId,
      original_price: originalPrice,
      discount,
      discount_price: discountPrice,
      images,
      status: 'pending',
      slots_total: Number(categoryDefaults.max_slots || 5),
      slots_used: 0,
      clicks: 0,
    };

    if (institutionId) {
      productData.institution_id = institutionId;
    }

    const { data, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) throw error;
    return { success: true, product: transformProduct(data) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('createProduct: Supabase unavailable, simulating creation.', err.message);
      const mockProduct = {
        id: 'mock-' + Date.now(),
        title, description,
        category: categoryId,
        originalPrice, discount, discountPrice,
        images, status: 'pending',
        slots: { used: 0, total: 5 },
        clicks: 0, couponsGenerated: 0, couponsUsed: 0,
        seller: { name: 'Você', whatsapp },
        createdAt: new Date().toISOString()
      };
      return { success: true, product: mockProduct };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Update a product
 */
export async function updateProduct(productId, updates) {
  try {
    const dbUpdates = {};
    if (updates.title) dbUpdates.title = updates.title;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.categoryId) dbUpdates.category_id = updates.categoryId;
    if (updates.originalPrice) dbUpdates.original_price = updates.originalPrice;
    if (updates.discount) dbUpdates.discount = updates.discount;
    if (updates.originalPrice && updates.discount) {
      dbUpdates.discount_price = Math.round(updates.originalPrice * (1 - updates.discount / 100) * 100) / 100;
    }
    if (updates.images) dbUpdates.images = updates.images;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.rejectionReason) dbUpdates.rejection_reason = updates.rejectionReason;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, product: transformProduct(data) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('updateProduct: Supabase unavailable.', err.message);
      return { success: true, product: { id: productId, ...updates } };
    }
    return { success: false, error: err.message };
  }
}

export async function updateSellerProduct(productId, updates) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/seller/products/${productId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Nao foi possivel atualizar o produto.');
    }
    return { success: true, product: transformProduct(data.product) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('updateSellerProduct: API unavailable.', err.message);
      return { success: true, product: { id: productId, ...updates, status: 'pending' } };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Delete a product
 */
export async function deleteProduct(productId) {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('deleteProduct: Supabase unavailable.', err.message);
      return { success: true };
    }
    return { success: false, error: err.message };
  }
}

export async function deleteSellerProduct(productId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/seller/products/${productId}`, {
      method: 'DELETE',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Nao foi possivel remover o produto.');
    }
    return { success: true, product: transformProduct(data.product) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('deleteSellerProduct: API unavailable.', err.message);
      return { success: true, product: { id: productId, status: 'expired' } };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Increment click count
 */
export async function incrementProductClicks(productId) {
  // Only call RPC if productId is a valid UUID (not a mock integer)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!productId || !uuidRe.test(String(productId))) return;
  try {
    const response = await fetch(`${API_URL}/products/${productId}/click`, { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Nao foi possivel registrar clique.');
    }
  } catch (err) {
    // Click tracking is non-critical; keep production console clean.
    if (USE_MOCKS) console.warn('incrementProductClicks: failed.', err.message);
  }
}

/**
 * Get pending products for admin moderation
 */
export async function getPendingProducts(institutionId = null) {
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        seller:profiles!seller_id (id, name, email, whatsapp, avatar, course, semester, verified)
      `)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(transformProduct);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getPendingProducts: using mock data.', err.message);
      const { pendingAds } = await import('../data/mock.js');
      return pendingAds;
    }
    return [];
  }
}

/**
 * Approve a product (admin action)
 */
export async function approveProduct(productId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/admin/products/${productId}/approve`, {
      method: 'POST',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Nao foi possivel aprovar o produto.');
    }
    return { success: true, product: transformProduct(data.product) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('approveProduct: API unavailable.', err.message);
      return { success: true, product: { id: productId, status: 'active' } };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Reject a product (admin action)
 */
export async function rejectProduct(productId, reason) {
  return updateProduct(productId, {
    status: 'rejected',
    rejectionReason: reason,
  });
}

/**
 * Request product changes from seller.
 * The current database status model stores this as rejected with a clear reason
 * so it leaves moderation and appears in the seller's rejected/needs-fix list.
 */
export async function requestProductAdjustment(productId, reason, note = '') {
  const details = [reason, note].filter(Boolean).join(' - ');
  return updateProduct(productId, {
    status: 'rejected',
    rejectionReason: `Ajuste solicitado: ${details || 'Revise as informacoes do anuncio.'}`,
  });
}

/**
 * Renew an expired product
 */
export async function renewProduct(productId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/seller/products/${productId}/renew`, {
      method: 'POST',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Nao foi possivel renovar o produto.');
    }
    return { success: true, product: transformProduct(data.product) };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('renewProduct: Supabase unavailable.', err.message);
      return { success: true };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Get all products for admin (all statuses)
 */
export async function getAllProducts(institutionId = null) {
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        seller:profiles!seller_id (id, name, email, whatsapp, avatar, course, semester, verified)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(transformProduct);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getAllProducts: using mock data.', err.message);
      return mockSellerAds;
    }
    return [];
  }
}

/**
 * Get category stats (for admin heatmap)
 */
export async function getCategoryStats(institutionId = null) {
  try {
    let query = supabase
      .from('products')
      .select('category_id, status')
      .is('deleted_at', null)
      .in('status', ['active', 'queue', 'pending']);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Build stats from raw data
    const catStats = {};
    (data || []).forEach(p => {
      if (!catStats[p.category_id]) {
        catStats[p.category_id] = { active: 0, queue: 0 };
      }
      if (p.status === 'active') catStats[p.category_id].active++;
      else if (p.status === 'queue' || p.status === 'pending') catStats[p.category_id].queue++;
    });

    return catStats;
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getCategoryStats: using mock data.', err.message);
      const { categoryHeat } = await import('../data/mock.js');
      return categoryHeat;
    }
    return {};
  }
}

// ─── Helpers ────────────────────────────────────────────

function transformProduct(dbProduct) {
  if (!dbProduct) return null;

  // Calculate time remaining
  let expiresIn = '24h 00min';
  if (dbProduct.expires_at) {
    const remaining = new Date(dbProduct.expires_at) - new Date();
    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      expiresIn = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}min`;
    } else {
      expiresIn = '00h 00min';
    }
  }

  return {
    id: dbProduct.id,
    sellerId: dbProduct.seller_id,
    title: dbProduct.title,
    description: dbProduct.description,
    category: dbProduct.category_id,
    originalPrice: parseFloat(dbProduct.original_price),
    discount: dbProduct.discount,
    discountPrice: parseFloat(dbProduct.discount_price),
    seller: dbProduct.seller ? {
      id: dbProduct.seller.id,
      name: dbProduct.seller.name,
      email: dbProduct.seller.email,
      whatsapp: dbProduct.seller.whatsapp,
      avatar: dbProduct.seller.avatar || dbProduct.seller.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      course: dbProduct.seller.course,
      semester: dbProduct.seller.semester,
      verified: dbProduct.seller.verified,
    } : null,
    images: dbProduct.images || [],
    expiresIn,
    expiresAt: dbProduct.expires_at,
    slots: {
      used: dbProduct.slots_used || 0,
      total: dbProduct.slots_total || 5,
    },
    clicks: dbProduct.clicks || 0,
    couponsGenerated: 0, // Will be computed from coupons table
    couponsUsed: 0,
    status: dbProduct.status,
    rejectionReason: dbProduct.rejection_reason,
    institutionId: dbProduct.institution_id,
    deletedAt: dbProduct.deleted_at,
    createdAt: dbProduct.created_at,
    waitTime: formatWaitTime(dbProduct.created_at),
  };
}

function formatWaitTime(createdAt) {
  if (!createdAt) return 'pouco tempo';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'pouco tempo';
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''}`;
}

function filterMockProducts(products, categoryId, search) {
  let filtered = [...products];

  if (categoryId && categoryId !== 'all') {
    filtered = filtered.filter(p => p.category === categoryId);
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(term) ||
      (p.description && p.description.toLowerCase().includes(term)) ||
      (p.seller?.name && p.seller.name.toLowerCase().includes(term))
    );
  }

  return filtered;
}

