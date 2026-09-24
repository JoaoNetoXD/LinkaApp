/**
 * Keyboard behaviour shared by every sheet and dialog in the app, whichever page opened it:
 * focus moves into the dialog, Tab stays inside it, Escape closes it, and focus returns to
 * the control that opened it. Pages keep rendering their dialogs as before.
 */
const DIALOG_SELECTOR = '.modal-backdrop, .coupon-sheet-overlay';
const CLOSE_SELECTOR = [
  '[data-dialog-close]', '.coupon-sheet-close', '.modal-close', '#closeLightbox',
  '[aria-label="Fechar"]', '[id^="close-"]', '[id^="cancel-"]', '[id^="cancel"]',
].join(', ');
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function topDialog() {
  const dialogs = [...document.querySelectorAll(DIALOG_SELECTOR)].filter((el) => el.isConnected);
  return dialogs[dialogs.length - 1] || null;
}

function focusables(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function installDialogA11y() {
  let current = null;
  let opener = null;

  const sync = () => {
    const dialog = topDialog();
    if (dialog === current) return;
    if (dialog) {
      if (!current) opener = document.activeElement;
      current = dialog;
      requestAnimationFrame(() => {
        if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
        const target = dialog.querySelector('[data-autofocus]') || focusables(dialog)[0];
        target?.focus({ preventScroll: true });
      });
    } else {
      current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }
  };
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', (event) => {
    const dialog = topDialog();
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const close = dialog.querySelector(CLOSE_SELECTOR);
      // Without a close control, a click on the backdrop itself is how these dialogs close.
      (close || dialog).click();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
