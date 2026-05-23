import { supabase } from '../lib/supabase.js';
import { categories as mockCategories } from '../data/mock.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const USE_MOCKS = import.meta.env.DEV;

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeCategory(row) {
  if (!row) return null;

  const maxSlots = Number(row.max_slots ?? row.maxSlots ?? 5);
  const durationHours = Number(row.duration_hours ?? row.durationHours ?? 24);

  return {
    id: row.id,
    name: row.name,
    icon: row.icon || 'Package',
    maxSlots: Number.isFinite(maxSlots) && maxSlots > 0 ? maxSlots : 5,
    durationHours: Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 24,
    institutionId: row.institution_id || row.institutionId || null,
    createdAt: row.created_at || row.createdAt || null,
  };
}

function withAll(categories) {
  return [{ id: 'all', name: 'Todos', icon: 'Grid3X3', maxSlots: 0, durationHours: 0 }, ...categories];
}

function fallbackCategories(includeAll) {
  return includeAll ? mockCategories : mockCategories.filter((category) => category.id !== 'all');
}

function parseApiError(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (typeof error === 'string') return error;
  return error.message || error.error || fallbackMessage;
}

async function readApiResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiError(payload, fallbackMessage));
  }
  return payload;
}

export async function getCategories({ includeAll = true } = {}) {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const normalized = (data || []).map(normalizeCategory).filter(Boolean);
    if (!normalized.length && USE_MOCKS) {
      return fallbackCategories(includeAll);
    }

    return includeAll ? withAll(normalized) : normalized;
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
    if (USE_MOCKS) return fallbackCategories(includeAll);
    return includeAll ? withAll([]) : [];
  }
}

export async function createCategory(payload) {
  try {
    const response = await fetch(`${API_URL}/admin/categories`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const result = await readApiResponse(response, 'Nao foi possivel criar a categoria.');
    return normalizeCategory(result.category);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    if (USE_MOCKS) {
      return normalizeCategory({
        id: payload.id || String(payload.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: payload.name,
        max_slots: payload.maxSlots || payload.max_slots || 5,
        duration_hours: payload.durationHours || payload.duration_hours || 24,
      });
    }
    throw error;
  }
}

export async function updateCategory(categoryId, payload) {
  try {
    const response = await fetch(`${API_URL}/admin/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const result = await readApiResponse(response, 'Nao foi possivel atualizar a categoria.');
    return normalizeCategory(result.category);
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    if (USE_MOCKS) {
      return normalizeCategory({
        id: categoryId,
        name: payload.name,
        max_slots: payload.maxSlots || payload.max_slots || 5,
        duration_hours: payload.durationHours || payload.duration_hours || 24,
      });
    }
    throw error;
  }
}

export async function deleteCategory(categoryId) {
  try {
    const response = await fetch(`${API_URL}/admin/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });
    await readApiResponse(response, 'Nao foi possivel excluir a categoria.');
    return true;
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    if (USE_MOCKS) return true;
    throw error;
  }
}

export function getCategoryName(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.name || 'Categoria';
}
