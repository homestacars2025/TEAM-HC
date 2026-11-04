import { sessionFetch } from './supabase';

describe('the client fetch', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const answer = (status: number) => { global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status })) as typeof fetch; };

  test('a rate-limited token refresh reads as a network failure, so the session is kept', async () => {
    answer(429);
    await expect(sessionFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).rejects.toThrow(TypeError);
    answer(408);
    await expect(sessionFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).rejects.toThrow(TypeError);
  });

  test('a refused token, a wrong password and other calls pass through untouched', async () => {
    answer(400);
    expect((await sessionFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).status).toBe(400);
    answer(429);
    expect((await sessionFetch('https://x.supabase.co/auth/v1/token?grant_type=password', { method: 'POST' })).status).toBe(429);
    expect((await sessionFetch('https://x.supabase.co/rest/v1/bookings', { method: 'GET' })).status).toBe(429);
  });
});
