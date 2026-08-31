import { uploadCertPhoto } from './upload';

describe('uploadCertPhoto', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('presigns, PUTs the bytes, then registers', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET' });
      if (u.endsWith('/photos/presign')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'http://minio/put-here', objectKey: 'certs/c1/p1' }),
          { status: 201 },
        );
      }
      if (u === 'http://minio/put-here') {
        return new Response(null, { status: 200 });
      }
      if (u.startsWith('file://')) {
        return new Response(new Blob(['bytes'])); // local asset read
      }
      if (u.endsWith('/photos')) {
        return new Response(
          JSON.stringify({ id: 'p1', url: 'http://minio/certs/c1/p1', sortOrder: 0 }),
          { status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const photo = await uploadCertPhoto({
      certNumber: '000000001',
      token: 'tok',
      uri: 'file:///slab.jpg',
      mimeType: 'image/jpeg',
      sortOrder: 0,
    });

    expect(photo.id).toBe('p1');
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'PUT', 'POST']);
  });

  it('throws when the PUT fails and never registers', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/photos/presign')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'http://minio/put-here', objectKey: 'k' }),
          { status: 201 },
        );
      }
      if (u.startsWith('file://')) {
        return new Response(new Blob(['bytes']));
      }
      if (u === 'http://minio/put-here') {
        return new Response(null, { status: 403 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    await expect(
      uploadCertPhoto({
        certNumber: '000000001',
        token: 'tok',
        uri: 'file:///slab.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
      }),
    ).rejects.toThrow('Upload failed');
  });
});
