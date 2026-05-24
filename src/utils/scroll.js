export function resetAppScroll(container = document, { behavior = 'auto' } = {}) {
  requestAnimationFrame(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {
      window.scrollTo(0, 0);
    }

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
