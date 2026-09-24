/**
 * Search text safe to place in a PostgREST filter: commas, parentheses, quotes and
 * wildcards would change the filter itself ("bolo, brownie" used to break the query).
 */
export function toSearchTerm(search) {
  return String(search || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s.@_'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
