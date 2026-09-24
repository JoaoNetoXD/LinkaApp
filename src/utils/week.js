/**
 * Counts items per local calendar day over the last `days` days, oldest first.
 * Feeds the 7-day charts of the company panel and the admin overview.
 * @returns {{ key: string, label: string, count: number }[]}
 */
export function countByDay(items, getDate, { days = 7, now = new Date() } = {}) {
  const buckets = Array.from({ length: days }, (_, index) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (days - 1 - index));
    return {
      key: dayKey(day),
      label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      count: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  (items || []).forEach((item) => {
    const raw = getDate(item);
    if (!raw) return;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    const bucket = byKey.get(dayKey(date));
    if (bucket) bucket.count += 1;
  });
  return buckets;
}

// Local calendar date, the day the user sees on their phone.
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
