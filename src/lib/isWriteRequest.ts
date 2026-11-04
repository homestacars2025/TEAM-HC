/** Anything but a read. Sign-in and refresh calls (`/auth/v1/`) go straight out. */
export function isWriteRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !url.includes('/auth/v1/');
}
