import { takePendingScroll } from './navigation.js';

/**
 * Puts a freshly rendered screen at the top, or back where the user left it when
 * they returned to it with the back button.
 */
export function resetAppScroll(container = document, { behavior = 'auto' } = {}) {
  requestAnimationFrame(() => {
    const top = takePendingScroll() ?? 0;
    try {
      window.scrollTo({ top, left: 0, behavior });
    } catch {
      window.scrollTo(0, top);
    }
    if (top) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const root = container?.querySelector?.('.app-body, .page, .buyer-wrapper, .admin-page, .seller-page, .auth-wrapper');
    [root, ...document.querySelectorAll('.app-body, .page, .buyer-wrapper, .admin-page, .seller-page, .auth-wrapper')]
      .filter(Boolean)
      .forEach((element) => {
        try {
          element.scrollTop = 0;
          element.scrollLeft = 0;
        } catch {
          // Some elements are not scroll containers.
        }
      });
  });
}
