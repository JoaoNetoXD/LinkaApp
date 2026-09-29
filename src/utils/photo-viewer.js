/**
 * Full-screen photo viewer that behaves like a phone's gallery: swipe between photos,
 * pinch or double-tap to zoom, drag a photo down to close. The phone's back button
 * closes it instead of leaving the offer.
 */

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;

const ICON_CLOSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ICON_PREV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
const ICON_NEXT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

/**
 * @param {{ images: string[], startIndex?: number, title?: string, onIndexChange?: (index: number) => void }} options
 */
export function openPhotoViewer({ images, startIndex = 0, title = '', onIndexChange } = {}) {
  const sources = (Array.isArray(images) ? images : []).filter(Boolean);
  const root = document.getElementById('modal-root');
  if (!root || !sources.length) return;

  const many = sources.length > 1;
  let index = clamp(startIndex, 0, sources.length - 1);

  root.innerHTML = `
    <div class="modal-backdrop photo-viewer" role="dialog" aria-modal="true" aria-label="${escapeText(title ? `Fotos de ${title}` : 'Fotos')}">
      <div class="photo-viewer-bar">
        <button class="photo-viewer-btn" type="button" data-dialog-close aria-label="Fechar">${ICON_CLOSE}</button>
        <strong class="photo-viewer-title">${escapeText(title)}</strong>
        <span class="photo-viewer-count" aria-live="polite"></span>
      </div>
      <div class="photo-viewer-stage">
        <div class="photo-viewer-track">
          ${sources.map((src, i) => `
            <div class="photo-viewer-slide">
              <img class="photo-viewer-img" src="${escapeText(src)}" alt="Foto ${i + 1} de ${sources.length}" draggable="false" decoding="async" />
            </div>
          `).join('')}
        </div>
      </div>
      ${many ? `
        <button class="photo-viewer-btn photo-viewer-arrow is-prev" type="button" aria-label="Foto anterior">${ICON_PREV}</button>
        <button class="photo-viewer-btn photo-viewer-arrow is-next" type="button" aria-label="Próxima foto">${ICON_NEXT}</button>
      ` : ''}
    </div>
  `;

  const viewer = root.querySelector('.photo-viewer');
  const stage = viewer.querySelector('.photo-viewer-stage');
  const track = viewer.querySelector('.photo-viewer-track');
  const photos = [...viewer.querySelectorAll('.photo-viewer-img')];
  const count = viewer.querySelector('.photo-viewer-count');
  const prevButton = viewer.querySelector('.is-prev');
  const nextButton = viewer.querySelector('.is-next');

  let width = stage.clientWidth || window.innerWidth;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const pointers = new Map();
  let gesture = null;
  let lastTap = { time: 0, x: 0, y: 0 };
  let tapTimer = 0;
  let closed = false;
  // Marks this viewer's own history entry (a reload can leave an older mark behind).
  const historyMark = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // --- zoom of the photo on screen -------------------------------------------------

  const stageCenter = () => {
    const rect = stage.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // How far a zoomed photo can move: its drawn size (it is contained), not the stage's.
  const panLimits = () => {
    const photo = photos[index];
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const ratio = photo.naturalWidth && photo.naturalHeight
      ? Math.min(stageWidth / photo.naturalWidth, stageHeight / photo.naturalHeight)
      : 1;
    const drawnWidth = photo.naturalWidth ? photo.naturalWidth * ratio : stageWidth;
    const drawnHeight = photo.naturalHeight ? photo.naturalHeight * ratio : stageHeight;
    return {
      x: Math.max(0, (drawnWidth * scale - stageWidth) / 2),
      y: Math.max(0, (drawnHeight * scale - stageHeight) / 2),
    };
  };

  const clampPan = () => {
    const limits = panLimits();
    tx = clamp(tx, -limits.x, limits.x);
    ty = clamp(ty, -limits.y, limits.y);
  };

  const applyZoom = (animate) => {
    const photo = photos[index];
    photo.classList.toggle('is-animating', animate);
    photo.style.transform = scale > 1 ? `translate3d(${tx}px, ${ty}px, 0) scale(${scale})` : '';
    viewer.classList.toggle('is-zoomed', scale > 1);
  };

  const resetZoom = (animate) => {
    scale = 1;
    tx = 0;
    ty = 0;
    applyZoom(animate);
  };

  const zoomAt = (x, y, nextScale) => {
    const center = stageCenter();
    scale = clamp(nextScale, 1, MAX_SCALE);
    // The point under the finger stays under it.
    tx = (x - center.x) * (1 - scale);
    ty = (y - center.y) * (1 - scale);
    clampPan();
    applyZoom(true);
  };

  // --- which photo is on screen ----------------------------------------------------

  const setTrack = (offset, animate) => {
    track.classList.toggle('is-animating', animate);
    track.style.transform = `translate3d(${-index * width + offset}px, 0, 0)`;
  };

  const updateChrome = () => {
    count.textContent = many ? `${index + 1} / ${sources.length}` : '';
    if (prevButton) prevButton.disabled = index === 0;
    if (nextButton) nextButton.disabled = index === sources.length - 1;
  };

  const goTo = (next) => {
    const target = clamp(next, 0, sources.length - 1);
    if (target !== index) {
      resetZoom(false);
      index = target;
      onIndexChange?.(index);
    }
    setTrack(0, true);
    updateChrome();
  };

  const setDismiss = (dy, animate) => {
    stage.classList.toggle('is-animating', animate);
    stage.style.transform = dy ? `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(dy / 1800, 0.1)})` : '';
    viewer.style.setProperty('--viewer-fade', String(1 - Math.min(dy / 420, 0.75)));
  };

  // --- gestures ------------------------------------------------------------------

  const handleTap = (x, y) => {
    const now = performance.now();
    if (now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 32) {
      window.clearTimeout(tapTimer);
      lastTap = { time: 0, x: 0, y: 0 };
      if (scale > 1) resetZoom(true);
      else zoomAt(x, y, DOUBLE_TAP_SCALE);
      return;
    }
    lastTap = { time: now, x, y };
    window.clearTimeout(tapTimer);
    // A single tap shows or hides the bars, like a phone's gallery.
    tapTimer = window.setTimeout(() => viewer.classList.toggle('is-chrome-hidden'), DOUBLE_TAP_MS);
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the gesture still works without capture.
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', startDistance: distance(a, b) || 1, startScale: scale, startTx: tx, startTy: ty, startMid: midpoint(a, b) };
      setTrack(0, true);
      setDismiss(0, true);
      return;
    }
    if (pointers.size === 1) {
      gesture = { type: 'pending', x: event.clientX, y: event.clientY, time: performance.now(), startTx: tx, startTy: ty };
    }
  };

  const onPointerMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture) return;

    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const center = stageCenter();
      const mid = midpoint(a, b);
      const pointX = (gesture.startMid.x - center.x - gesture.startTx) / gesture.startScale;
      const pointY = (gesture.startMid.y - center.y - gesture.startTy) / gesture.startScale;
      scale = clamp(gesture.startScale * (distance(a, b) / gesture.startDistance), 1, MAX_SCALE);
      tx = mid.x - center.x - pointX * scale;
      ty = mid.y - center.y - pointY * scale;
      applyZoom(false);
      return;
    }

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.type === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      if (scale > 1) gesture.type = 'pan';
      else if (Math.abs(dx) > Math.abs(dy)) gesture.type = many ? 'swipe' : 'none';
      else gesture.type = dy > 0 ? 'dismiss' : 'none';
    }

    if (gesture.type === 'pan') {
      tx = gesture.startTx + dx;
      ty = gesture.startTy + dy;
      clampPan();
      applyZoom(false);
    } else if (gesture.type === 'swipe') {
      const pastEdge = (index === 0 && dx > 0) || (index === sources.length - 1 && dx < 0);
      setTrack(pastEdge ? dx * 0.3 : dx, false);
    } else if (gesture.type === 'dismiss') {
      setDismiss(Math.max(dy, 0), false);
    }
  };

  const onPointerUp = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!gesture) return;

    if (gesture.type === 'pinch') {
      if (pointers.size === 1) {
        // One finger left on the glass keeps moving the zoomed photo.
        const [finger] = [...pointers.values()];
        gesture = { type: scale > 1 ? 'pan' : 'none', x: finger.x, y: finger.y, time: performance.now(), startTx: tx, startTy: ty };
        return;
      }
      gesture = null;
      if (scale < 1.05) resetZoom(true);
      else {
        clampPan();
        applyZoom(true);
      }
      return;
    }
    if (pointers.size) return;

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const elapsed = Math.max(performance.now() - gesture.time, 1);
    const { type } = gesture;
    gesture = null;

    if (type === 'swipe') {
      const velocity = dx / elapsed;
      if (dx < -width * 0.18 || velocity < -0.45) goTo(index + 1);
      else if (dx > width * 0.18 || velocity > 0.45) goTo(index - 1);
      else setTrack(0, true);
    } else if (type === 'dismiss') {
      if (dy > 120 || dy / elapsed > 0.6) close();
      else setDismiss(0, true);
    } else if (type === 'pending') {
      handleTap(event.clientX, event.clientY);
    }
  };

  const onPointerCancel = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size) return;
    gesture = null;
    setTrack(0, true);
    setDismiss(0, true);
    if (scale < 1.05) resetZoom(true);
  };

  // Trackpad pinch and Ctrl + wheel on computers.
  const onWheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const center = stageCenter();
    const pointX = (event.clientX - center.x - tx) / scale;
    const pointY = (event.clientY - center.y - ty) / scale;
    scale = clamp(scale * Math.exp(-event.deltaY * 0.01), 1, MAX_SCALE);
    tx = event.clientX - center.x - pointX * scale;
    ty = event.clientY - center.y - pointY * scale;
    clampPan();
    applyZoom(false);
  };

  const onKeyDown = (event) => {
    if (!viewer.isConnected) return;
    if (event.key === 'ArrowLeft') goTo(index - 1);
    else if (event.key === 'ArrowRight') goTo(index + 1);
  };

  const onResize = () => {
    width = stage.clientWidth || window.innerWidth;
    resetZoom(false);
    setTrack(0, false);
  };

  // --- opening and closing -----------------------------------------------------------

  const onPopState = () => close({ fromHistory: true });

  function close({ fromHistory = false } = {}) {
    if (closed) return;
    closed = true;
    window.clearTimeout(tapTimer);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKeyDown);
    document.documentElement.classList.remove('photo-viewer-open');
    viewer.classList.add('is-closing');
    window.setTimeout(() => viewer.remove(), 180);
    if (!fromHistory && window.history.state?.photoViewer === historyMark) window.history.back();
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  stage.addEventListener('wheel', onWheel, { passive: false });
  viewer.querySelector('[data-dialog-close]').addEventListener('click', () => close());
  prevButton?.addEventListener('click', () => goTo(index - 1));
  nextButton?.addEventListener('click', () => goTo(index + 1));
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  // An entry of its own in the history: "back" closes the photos, not the offer.
  window.history.pushState({ ...(window.history.state || {}), photoViewer: historyMark }, '');
  window.addEventListener('popstate', onPopState);
  document.documentElement.classList.add('photo-viewer-open');

  setTrack(0, false);
  updateChrome();
}
