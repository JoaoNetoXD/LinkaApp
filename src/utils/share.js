/** Copies text; falls back to a hidden field where the async clipboard API is blocked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // In-app browsers (Instagram, some WhatsApp builds) can refuse the async clipboard.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.className = 'sr-only';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

/**
 * Opens the device share sheet for a link, or copies the link where there is none.
 * Resolves to 'shared', 'copied', 'cancelled' or 'failed'.
 */
export async function shareLink({ title, text, url }) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

/**
 * Share message for an offer. Written without articles ("no"/"na"), which would
 * have to agree with the gender of whatever the offer title names.
 */
export function offerShareText(product, formatCurrency) {
  const price = formatCurrency(product.discountPrice);
  const discount = Number(product.discount) || 0;
  return discount > 0
    ? `${product.title} com ${discount}% de desconto: sai por ${price} com o cupom do Empreende iCEV.`
    : `${product.title} por ${price} no Empreende iCEV.`;
}
