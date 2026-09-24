import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para continuar.');
  const response = await fetch(`${API_URL}/superadmin${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}

export function getPlatformUsers(page = 1, search = '') {
  const params = new URLSearchParams({ page: String(page), search });
  return request(`/users?${params}`);
}

export function updatePlatformUser(userId, updates) {
  return request(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function createPlatformInstitution(values) {
  return request('/institutions', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}
