import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('GETs JSON with a bearer token', async () => {
    const mock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    const result = await apiFetch<{ ok: boolean }>('/health', { token: 'tok' });
    expect(result).toEqual({ ok: true });
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toMatch(/\/health$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('POSTs a JSON body', async () => {
    const mock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 201 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    await apiFetch('/certs', { method: 'POST', body: { a: 1 }, token: 't' });
    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with the server message on non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: 'already graded' }), {
        status: 409,
      }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 409,
      message: 'already graded',
    });
  });

  it('returns undefined for 204', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
