import { describe, it, expect } from 'vitest';
import { createSignature, buildMultipartBody } from '../api';

describe('createSignature', () => {
  it('produces a deterministic HHMAC Authorization header', () => {
    // key_secret = base64("testsecret") = "dGVzdHNlY3JldA=="
    const auth = createSignature(
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
    const auth2 = createSignature(
      'GET',
      'https://news-api.apple.com/channels/abc123',
      '2021-01-01T00:00:00Z',
      'mykeyid',
      'dGVzdHNlY3JldA==',
    );
    expect(auth).toBe(auth2);
  });

  it('produces a different signature for different methods', () => {
    const get = createSignature('GET', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    const post = createSignature('POST', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    expect(get).not.toBe(post);
  });

  it('includes content-type and body in the signed canonical when provided', () => {
    const withBody = createSignature(
      'POST',
      'https://news-api.apple.com/channels/abc/articles',
      '2021-01-01T00:00:00Z',
      'k',
      'dGVzdA==',
      'multipart/form-data; boundary=abc',
      'body-content',
    );
    const withoutBody = createSignature(
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
