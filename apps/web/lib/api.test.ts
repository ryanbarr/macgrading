import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCert, listCerts } from './api';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('getCert', () => {
  it('returns the cert on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ certNumber: '000000001' }), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(getCert('000000001')).resolves.toMatchObject({
      certNumber: '000000001',
    });
  });

  it('returns null on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(getCert('999999999')).resolves.toBeNull();
  });

  it('throws on other errors', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(getCert('000000001')).rejects.toThrow('API error 500');
  });

  it('encodes the cert number so it cannot traverse to another API path', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 404 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    await getCert('../auth/google');
    const url = String(mock.mock.calls[0][0]);
    expect(url).toContain('/certs/..%2Fauth%2Fgoogle');
    expect(url).not.toContain('/auth/google');
  });

  it('fetches a well-formed cert number unchanged', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 404 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    await getCert('P000000042');
    const url = String(mock.mock.calls[0][0]);
    expect(url).toContain('/certs/P000000042');
  });
});

describe('listCerts', () => {
  it('builds the query string and returns the list', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 12, total: 0 }), {
        status: 200,
      }),
    );
    global.fetch = mock as unknown as typeof fetch;
    await listCerts({ q: 'char', page: 2, pageSize: 12 });
    const url = String(mock.mock.calls[0][0]);
    expect(url).toContain('/certs?');
    expect(url).toContain('q=char');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=12');
  });
});
