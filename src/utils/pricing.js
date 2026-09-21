export function hasVisibleDiscount(product) {
  const discount = Number(product?.discount);
  const original = Number(product?.originalPrice);
  const current = Number(product?.discountPrice);
  return Number.isFinite(discount) && discount > 0
    && Number.isFinite(original) && Number.isFinite(current) && current < original;
}
