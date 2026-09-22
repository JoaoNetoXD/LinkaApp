export const ADMIN_ROLES = ['admin', 'superadmin'];

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function canSuperadminEditProfile(actor, target, updates) {
  if (actor?.role !== 'superadmin' || !target) return false;
  if (target.role === 'superadmin') return false;
  if (updates.role === 'superadmin') return false;
  return true;
}
