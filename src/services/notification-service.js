/**
 * Notification Service — Linka
 * Push notifications via Service Worker + in-app notifications via Supabase.
 */
import { supabase } from '../lib/supabase.js';

const USE_MOCKS = import.meta.env.DEV;

// ─── In-App Notifications (Supabase) ────────────────────

export async function getNotifications(userId, { unreadOnly = false, limit = 20 } = {}) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
  if (!userId || !uuidRe.test(String(userId))) return USE_MOCKS ? getMockNotifications() : [];
  try {
    let query = supabase.from('notifications')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(limit);
    if (unreadOnly) query = query.eq('read', false);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('getNotifications failed:', err.message);
      return getMockNotifications();
    }
    return [];
  }
}

export async function getUnreadCount(userId) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
  if (!userId || !uuidRe.test(String(userId))) return USE_MOCKS ? 2 : 0;
  try {
    const { count, error } = await supabase.from('notifications')
      .select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false);
    if (error) throw error;
    return count || 0;
  } catch { return USE_MOCKS ? 2 : 0; }
}

export async function markAsRead(notificationId) {
  try {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function markAllAsRead(userId) {
  try {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function createNotification({ userId, title, body, type = 'info', actionUrl = null }) {
  try {
    const { data, error } = await supabase.from('notifications').insert({
      user_id: userId, title, body, type, action_url: actionUrl,
    }).select().single();
    if (error) throw error;
    return { success: true, notification: data };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('createNotification failed:', err.message);
    }
    return { success: false, error: err.message };
  }
}

// ─── Push Notifications (Service Worker) ────────────────

export async function requestPushPermission() {
  if (!('Notification' in window)) return { granted: false, error: 'Navegador não suporta notificações.' };
  if (Notification.permission === 'granted') return { granted: true };
  if (Notification.permission === 'denied') return { granted: false, error: 'Notificações bloqueadas pelo usuário.' };

  const permission = await Notification.requestPermission();
  return { granted: permission === 'granted' };
}

export async function subscribeToPush() {
  try {
    const { granted } = await requestPushPermission();
    if (!granted) return { success: false, error: 'Permissão negada.' };

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkOs-F9nI7gDKg7QrKBQKxHSIg3K98GpIE2DKNKWGE')
    });

    console.log('Push subscription:', JSON.stringify(subscription));
    return { success: true, subscription };
  } catch (err) {
    console.warn('Push subscription failed:', err.message);
    return { success: false, error: err.message };
  }
}

export function sendLocalNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      icon: '/icons/favicon.png',
      badge: '/icons/favicon.png',
      vibrate: [200, 100, 200],
      ...options,
    });
  } catch {
    // SW notification fallback
    navigator.serviceWorker?.ready.then(reg => {
      reg.showNotification(title, { icon: '/icons/favicon.png', ...options });
    });
  }
}

// ─── Real-time subscription ─────────────────────────────

export function subscribeToNotifications(userId, callback) {
  const channel = supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      callback(payload.new);
      sendLocalNotification(payload.new.title, { body: payload.new.body });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─── Helpers ────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function getMockNotifications() {
  return [
    { id: '1', title: 'Cupom gerado!', body: 'Seu cupom A7K2 para Brownie Artesanal está ativo.', type: 'success', read: false, created_at: new Date().toISOString() },
    { id: '2', title: 'Oferta expirando', body: 'Açaí no Copo 500ml expira em 2h.', type: 'warning', read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: '3', title: 'Pagamento confirmado', body: 'Pix de R$ 9,00 aprovado com sucesso.', type: 'success', read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
  ];
}
