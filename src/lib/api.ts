import { createHmac } from 'node:crypto';

const APPLE_NEWS_BASE_URL = 'https://news-api.apple.com';

export type ApiCredentials = {
  apiKeyId: string;
  apiKeySecret: string;
  channelId: string;
};

export type AppleNewsArticleData = {
  id: string;
  revision: string;
  shareUrl: string;
  publishedAt?: string;
};

/**
 * Builds the HHMAC Authorization header value.
 * Exported for testing. Canonical string = method + url + date [+ contentType + bodyStr].
 */
export function createSignature(
  method: string,
  url: string,
  date: string,
  apiKeyId: string,
  apiKeySecret: string,
  contentType?: string,
  bodyStr?: string,
): string {
  const keyBytes = Buffer.from(apiKeySecret, 'base64');
  let canonical = method + url + date;
  if (contentType && bodyStr !== undefined) {
    canonical += contentType + bodyStr;
  }
  const signature = createHmac('sha256', keyBytes)
    .update(canonical, 'utf8')
    .digest('base64');
  return `HHMAC; key=${apiKeyId}; signature=${signature}; date=${date}`;
}

export type MultipartPart = {
  name: string;
  data: string;
  mimeType: string;
};

/**
 * Builds a multipart/form-data body.
 * Returns the raw Buffer and the Content-Type header value (including boundary).
 * Exported for testing.
 */
export function buildMultipartBody(parts: MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const dataBytes = Buffer.from(part.data, 'utf8');
    const header = [
      `--${boundary}`,
      `Content-Type: ${part.mimeType}`,
      `Content-Disposition: form-data; filename=${part.name}; size=${dataBytes.length}`,
      '',
      '',
    ].join('\r\n');
    chunks.push(Buffer.from(header, 'utf8'));
    chunks.push(dataBytes);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--`, 'utf8'));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function appleNewsRequest(
  method: string,
  path: string,
  credentials: ApiCredentials,
  bodyParts?: MultipartPart[],
): Promise<unknown> {
  const url = `${APPLE_NEWS_BASE_URL}/${path}`;
  const date = nowIso();

  let fetchInit: RequestInit;
  if (bodyParts) {
    const { body, contentType } = buildMultipartBody(bodyParts);
    const bodyStr = body.toString('utf8');
    const authorization = createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret, contentType, bodyStr);
    fetchInit = {
      method,
      headers: { Authorization: authorization, 'Content-Type': contentType },
      body,
    };
  } else {
    const authorization = createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret);
    fetchInit = { method, headers: { Authorization: authorization } };
  }

  const resp = await fetch(url, fetchInit);
  if (method === 'DELETE') {
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.json().catch(() => null);
      throw new Error(`Apple News DELETE returned ${resp.status}: ${JSON.stringify(body)}`);
    }
    return null;
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(`Apple News ${method} ${path} returned ${resp.status}: ${JSON.stringify(body)}`);
  }
  return resp.json();
}

/** Creates a new article in Apple News. Returns the article data including id, revision, shareUrl. */
export async function createArticle(
  articleJson: unknown,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const parts: MultipartPart[] = [
    { name: 'article.json', data: JSON.stringify(articleJson), mimeType: 'application/json' },
  ];
  const resp = (await appleNewsRequest('POST', `channels/${credentials.channelId}/articles`, credentials, parts)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Reads an existing article to get the latest revision. */
export async function readArticle(
  articleId: string,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const resp = (await appleNewsRequest('GET', `articles/${articleId}`, credentials)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Updates an existing article. Requires the current revision (obtained via readArticle). */
export async function updateArticle(
  articleId: string,
  revision: string,
  articleJson: unknown,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const metadata = { data: { revision } };
  const parts: MultipartPart[] = [
    { name: 'metadata', data: JSON.stringify(metadata), mimeType: 'application/json' },
    { name: 'article.json', data: JSON.stringify(articleJson), mimeType: 'application/json' },
  ];
  const resp = (await appleNewsRequest('POST', `articles/${articleId}`, credentials, parts)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Deletes an article. Does not throw on 404. */
export async function deleteArticle(
  articleId: string,
  credentials: ApiCredentials,
): Promise<void> {
  await appleNewsRequest('DELETE', `articles/${articleId}`, credentials);
}
