/**
 * Navigation on top of the hash router. Every screen has its own #/ address, so the
 * phone's back button, a refresh and a shared link all land on the right screen.
 *
 * Each history entry carries an id and its depth inside the app (history.state):
 * the depth tells "Voltar" whether the previous entry is still the app, and the id
 * keys the scroll position the user left it at, restored when they come back.
 */

let currentEntryId = null;
let depth = 0;
let synced = false;
let replacing = false;
let pendingScroll = null;
const scrollPositions = new Map();

// Offer ids are UUIDs in the database and short ids in the local mock data.
const OFFER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function readState() {
  const state = window.history.state;
  return state && typeof state === 'object' ? state : {};
}

function newEntryId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Router hook, called on every route change before the new screen renders.
 * The old screen is still on the page at this point, so its scroll is recorded here.
 */
export function syncHistoryEntry() {
  const leavingId = currentEntryId;
  const leavingY = window.scrollY;
  let state = readState();
  if (typeof state.entryId !== 'string') {
    state = { ...state, entryId: newEntryId(), appDepth: synced && !replacing ? depth + 1 : depth };
    try {
      window.history.replaceState(state, '');
    } catch {
      // Some in-app browsers refuse history writes; the app still navigates without the extras.
    }
  }
  if (leavingId && leavingId !== state.entryId) scrollPositions.set(leavingId, leavingY);
  currentEntryId = state.entryId;
  depth = Number.isInteger(state.appDepth) ? state.appDepth : 0;
  pendingScroll = leavingId === state.entryId ? null : scrollPositions.get(state.entryId) ?? null;
  synced = true;
  replacing = false;
}

/** Where the screen that just opened should scroll to: the saved spot when coming back, otherwise null. */
export function takePendingScroll() {
  const value = pendingScroll;
  pendingScroll = null;
  return value;
}

/** Opens an in-app address such as "#/buyer/coupons"; the current address renders again. */
export function navigate(hash, { replace = false } = {}) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) {
    replacing = true;
    window.location.replace(hash);
    return;
  }
  window.location.hash = hash;
}

/** "Voltar": steps back while the previous entry is the app, otherwise opens the fallback screen. */
export function goBack(fallbackHash) {
  if (depth > 0) {
    window.history.back();
    return;
  }
  navigate(fallbackHash, { replace: true });
}

export function getHashParams() {
  const query = (window.location.hash.split('?')[1] || '').split('#')[0];
  return new URLSearchParams(query);
}

export function offerRoute(offerId) {
  return `#/buyer/offer?id=${encodeURIComponent(String(offerId))}`;
}

export function isValidOfferId(value) {
  return OFFER_ID_PATTERN.test(String(value || ''));
}

/** Absolute link to an offer, for sharing outside the app. */
export function offerShareUrl(offerId) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${offerRoute(offerId)}`;
}

/** Sign-in address that returns to the given in-app screen once the student is in. */
export function authRoute({ next = '', intent = '' } = {}) {
  const params = new URLSearchParams();
  if (intent) params.set('intent', intent);
  if (next) params.set('next', next);
  const query = params.toString();
  return `#/auth${query ? `?${query}` : ''}`;
}

// Screens the sign-in may return to: company and admin sections, an offer, an offer being
// edited. Other sites, other screens and extra parameters fall back to the account's home.
const NEXT_SECTION_ROUTE = /^#\/(seller(\/(ads|coupons|insights|create))?|admin(\/[a-z]+)?)$/;
const NEXT_ID_ROUTE = /^#\/(buyer\/offer|seller\/edit)\?id=([^&#]+)$/;

/** The "next" screen requested by the sign-in address, if it is one the app can return to. */
export function readNextRoute(hash = window.location.hash) {
  const query = (String(hash).split('?')[1] || '').split('#')[0];
  const next = new URLSearchParams(query).get('next') || '';
  if (NEXT_SECTION_ROUTE.test(next)) return next;
  const match = next.match(NEXT_ID_ROUTE);
  if (!match) return '';
  let id = '';
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return '';
  }
  return isValidOfferId(id) ? `#/${match[1]}?id=${encodeURIComponent(id)}` : '';
}
