/**
 * The `reference_url` column on `media.ideas` and `media.posts` — an Instagram
 * link to a trend or an example the piece is modelled on.
 *
 * Kept deliberately forgiving: people paste `instagram.com/p/…` far more often
 * than they type a scheme, and rejecting that would only train them to put the
 * link back in the caption. Anything without a scheme gets `https://`.
 */

/**
 * Canonical form for storage and for `href`. `null` means "unset" — `""` and
 * `"   "` both collapse to it, so an emptied field clears the column.
 */
export function normalizeReferenceUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * A short, readable stand-in for the raw URL — `instagram.com/reel/xyz` rather
 * than the full query string. Falls back to the input when it cannot be parsed,
 * because a chip that says nothing is worse than one that says too much.
 */
export function referenceLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.replace(/^www\./, '') + (pathname === '/' ? '' : pathname);
  } catch {
    return url;
  }
}
