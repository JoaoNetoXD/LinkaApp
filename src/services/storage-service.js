/**
 * Storage Service — Linka (Supabase Storage)
 * Handles image uploads for product listings.
 */
import { supabase } from '../lib/supabase.js';

const BUCKET_NAME = 'product-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const USE_MOCKS = import.meta.env.DEV;

export async function uploadProductImage(file, sellerId) {
  if (!file) return { success: false, error: 'Nenhum arquivo selecionado.' };
  if (!ALLOWED_TYPES.includes(file.type)) return { success: false, error: 'Formato inválido. Use JPG, PNG, WebP ou GIF.' };
  if (file.size > MAX_FILE_SIZE) return { success: false, error: 'Arquivo muito grande. Máximo 5MB.' };

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${sellerId}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, file, {
      cacheControl: '3600', upsert: false, contentType: file.type,
    });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);
    return { success: true, url: urlData.publicUrl, path: data.path };
  } catch (err) {
    if (USE_MOCKS) {
      console.warn('Upload failed, using local preview:', err.message);
      try {
        return { success: true, url: URL.createObjectURL(file), path: `local/${file.name}`, isLocal: true };
      } catch {
        return { success: false, error: 'Erro ao fazer upload da imagem.' };
      }
    }
    return { success: false, error: err.message || 'Erro ao fazer upload da imagem.' };
  }
}

export async function uploadMultipleImages(files, sellerId) {
  const urls = [], errors = [];
  for (const file of Array.from(files).slice(0, 3)) {
    const r = await uploadProductImage(file, sellerId);
    r.success ? urls.push(r.url) : errors.push(r.error);
  }
  return { urls, errors };
}

export async function deleteProductImage(path) {
  if (!path || path.startsWith('local/')) return { success: true };
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export function createPreviewURL(file) {
  return URL.createObjectURL(file);
}
