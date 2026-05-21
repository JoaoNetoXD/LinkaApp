/**
 * Institution Service — Linka (Multi-tenant)
 * Handles institution CRUD and switching for multi-tenant support.
 */
import { supabase } from '../lib/supabase.js';
import { institution as mockInstitution } from '../data/mock.js';

const STORAGE_KEY = 'linka_institution_id';
const USE_MOCKS = import.meta.env.DEV;
const QUERY_TIMEOUT_MS = 2500;

function withTimeout(promise, ms = QUERY_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo limite ao consultar instituicao.')), ms);
    }),
  ]);
}

/** Get current institution from localStorage or default */
export function getCurrentInstitutionId() {
  return localStorage.getItem(STORAGE_KEY) || null;
}

export function setCurrentInstitutionId(id) {
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

/** Get institution by ID */
export async function getInstitution(institutionId) {
  if (!institutionId) return USE_MOCKS ? mockInstitution : null;
  try {
    const { data, error } = await withTimeout(supabase.from('institutions')
      .select('*').eq('id', institutionId).single());
    if (error) throw error;
    return transformInstitution(data);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getInstitution: using mock.', err.message);
      return mockInstitution;
    }
    return null;
  }
}

/** Get institution by email domain */
export async function getInstitutionByDomain(emailDomain) {
  try {
    const { data, error } = await supabase.from('institutions')
      .select('*').eq('domain', emailDomain).single();
    if (error) throw error;
    return transformInstitution(data);
  } catch {
    return null;
  }
}

/** Get all institutions */
export async function getAllInstitutions() {
  try {
    const { data, error } = await supabase.from('institutions')
      .select('*').order('name');
    if (error) throw error;
    return (data || []).map(transformInstitution);
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getAllInstitutions: using mock.', err.message);
      return [mockInstitution];
    }
    return [];
  }
}

/** Create a new institution (admin/superadmin) */
export async function createInstitution({ name, fullName, domain, logoUrl, primaryColor, plan = 'basic', settings = {} }) {
  try {
    const { data, error } = await supabase.from('institutions').insert({
      name, full_name: fullName, domain, logo_url: logoUrl,
      primary_color: primaryColor || '#2563eb', plan, settings,
    }).select().single();
    if (error) throw error;
    return { success: true, institution: transformInstitution(data) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Update institution settings */
export async function updateInstitution(institutionId, updates) {
  try {
    const dbUpdates = {};
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.fullName) dbUpdates.full_name = updates.fullName;
    if (updates.domain) dbUpdates.domain = updates.domain;
    if (updates.logoUrl) dbUpdates.logo_url = updates.logoUrl;
    if (updates.primaryColor) dbUpdates.primary_color = updates.primaryColor;
    if (updates.plan) dbUpdates.plan = updates.plan;
    if (updates.settings) dbUpdates.settings = updates.settings;

    const { data, error } = await supabase.from('institutions')
      .update(dbUpdates).eq('id', institutionId).select().single();
    if (error) throw error;
    return { success: true, institution: transformInstitution(data) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Get institution stats (admin dashboard) */
export async function getInstitutionStats(institutionId) {
  try {
    let profilesQ = supabase.from('profiles').select('id', { count: 'exact', head: true });
    let productsQ = supabase.from('products').select('id, status, clicks', { count: 'exact' });
    let couponsQ = supabase.from('coupons').select('id, status', { count: 'exact' });

    if (institutionId) {
      profilesQ = profilesQ.eq('institution_id', institutionId);
      productsQ = productsQ.eq('institution_id', institutionId);
    }

    const [profilesRes, productsRes, couponsRes] = await Promise.all([
      profilesQ, productsQ, couponsQ,
    ]);

    const students = profilesRes.count || 0;
    const products = productsRes.data || [];
    const coupons = couponsRes.data || [];
    const totalClicks = products.reduce((s, p) => s + (p.clicks || 0), 0);
    const usedCoupons = coupons.filter(c => c.status === 'used').length;
    const generatedCoupons = couponsRes.count || coupons.length || 0;
    const conversion = generatedCoupons > 0 ? Math.round((usedCoupons / generatedCoupons) * 100) : 0;

    return {
      students: { value: students, change: '', positive: true },
      clicks: { value: totalClicks.toLocaleString(), change: '', positive: true },
      couponsGenerated: { value: generatedCoupons, change: '', positive: true },
      couponsUsed: { value: usedCoupons, change: '', positive: true },
      conversionRate: { value: `${conversion}%`, change: '', positive: true },
      pendingAds: { value: products.filter(p => p.status === 'pending').length, change: '0', positive: true },
    };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getInstitutionStats: using mock.', err.message);
      const { adminStats } = await import('../data/mock.js');
      return adminStats;
    }
    return {
      students: { value: 0, change: '0', positive: true },
      clicks: { value: '0', change: '0', positive: true },
      couponsGenerated: { value: 0, change: '0', positive: true },
      couponsUsed: { value: 0, change: '0', positive: true },
      conversionRate: { value: '0%', change: '0', positive: true },
      pendingAds: { value: 0, change: '0', positive: true },
    };
  }
}

/** Auto-detect institution from user email */
export function detectInstitutionDomain(email) {
  if (!email || !email.includes('@')) return null;
  return '@' + email.split('@')[1];
}

function transformInstitution(data) {
  if (!data) return USE_MOCKS ? mockInstitution : null;
  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name || data.name,
    domain: data.domain,
    logoUrl: data.logo_url,
    primaryColor: data.primary_color || '#2563eb',
    plan: data.plan || 'basic',
    settings: data.settings || {},
    createdAt: data.created_at,
  };
}
