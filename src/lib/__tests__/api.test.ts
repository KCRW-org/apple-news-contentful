import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSignature, buildMultipartBody, createArticle, updateArticle, AppleNewsApiError } from '../api';

describe('createSignature', () => {
  it('produces a deterministic HHMAC Authorization header', async () => {
    // key_secret = base64("testsecret") = "dGVzdHNlY3JldA=="
    const auth = await createSignature(
      'GET',
      'https://news-api.apple.com/channels/abc123',
      '2021-01-01T00:00:00Z',
      'mykeyid',
      'dGVzdHNlY3JldA==',
    );
    expect(auth).toMatch(
      /^HHMAC; key=mykeyid; signature=[A-Za-z0-9+/]+=*; date=2021-01-01T00:00:00Z$/,
    );
    // Same inputs → same output
    const auth2 = await createSignature(
      'GET',
      'https://news-api.apple.com/channels/abc123',
      '2021-01-01T00:00:00Z',
      'mykeyid',
      'dGVzdHNlY3JldA==',
    );
    expect(auth).toBe(auth2);
  });

  it('produces a different signature for different methods', async () => {
    const get = await createSignature('GET', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    const post = await createSignature('POST', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    expect(get).not.toBe(post);
  });

  it('includes content-type and body in the signed canonical when provided', async () => {
    const withBody = await createSignature(
      'POST',
      'https://news-api.apple.com/channels/abc/articles',
      '2021-01-01T00:00:00Z',
      'k',
      'dGVzdA==',
      'multipart/form-data; boundary=abc',
      'body-content',
    );
    const withoutBody = await createSignature(
      'POST',
      'https://news-api.apple.com/channels/abc/articles',
      '2021-01-01T00:00:00Z',
      'k',
      'dGVzdA==',
    );
    expect(withBody).not.toBe(withoutBody);
  });
});

describe('buildMultipartBody', () => {
  it('builds a multipart body with correct content-type boundary', () => {
    const { body, contentType } = buildMultipartBody([
      { name: 'article.json', data: '{"version":"1.7"}', mimeType: 'application/json' },
    ]);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=.+$/);
    const boundary = contentType.split('boundary=')[1];
    const bodyText = body.toString('utf8');
    expect(bodyText).toContain(`--${boundary}`);
    expect(bodyText).toContain('Content-Type: application/json');
    expect(bodyText).toContain('filename=article.json');
    expect(bodyText).toContain('{"version":"1.7"}');
    expect(bodyText).toContain(`--${boundary}--`);
  });

  it('includes metadata part before article.json when metadata is provided', () => {
    const { body } = buildMultipartBody([
      { name: 'metadata', data: '{"data":{}}', mimeType: 'application/json' },
      { name: 'article.json', data: '{"version":"1.7"}', mimeType: 'application/json' },
    ]);
    const bodyText = body.toString('utf8');
    const metaIdx = bodyText.indexOf('filename=metadata');
    const articleIdx = bodyText.indexOf('filename=article.json');
    expect(metaIdx).toBeLessThan(articleIdx);
  });
});

describe('AppleNewsApiError', () => {
  const credentials = { apiKeyId: 'k', apiKeySecret: 'dGVzdA==', channelId: 'chan' };
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('throws AppleNewsApiError with parsed code on 409 WRONG_REVISION update', async () => {
    const body = { errors: [{ code: 'WRONG_REVISION', keyPath: [], message: 'stale' }] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch;

    await expect(updateArticle('art-1', 'rev-1', { version: '1.7' }, credentials)).rejects.toMatchObject({
      name: 'AppleNewsApiError',
      status: 409,
      code: 'WRONG_REVISION',
    });
  });

  it('throws AppleNewsApiError with null code when body has no errors array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => JSON.stringify({ message: 'internal error' }),
    }) as unknown as typeof fetch;

    try {
      await createArticle({ version: '1.7' }, credentials);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppleNewsApiError);
      const e = err as AppleNewsApiError;
      expect(e.status).toBe(500);
      expect(e.code).toBeNull();
    }
  });

  it('produces a user-facing message for 5xx responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => '<html>Service Unavailable</html>',
    }) as unknown as typeof fetch;

    try {
      await createArticle({ version: '1.7' }, credentials);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppleNewsApiError);
      const e = err as AppleNewsApiError;
      expect(e.status).toBe(503);
      expect(e.message).toContain('temporarily unavailable');
    }
  });

  it('retries on 429 and succeeds on the next attempt', async () => {
    const successBody = { data: { id: 'art-1', revision: 'rev-1', shareUrl: 'https://apple.news/art-1' } };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify(successBody),
      }) as unknown as typeof fetch;

    const result = await createArticle({ version: '1.7' }, credentials);
    expect(result).toEqual(successBody.data);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
