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
  /** Processing state from Apple News. See docs/apple-news-api.md "Article States". */
  state?: string;
  /** Non-fatal warnings returned by Apple News. Array of `{ keyPath?, message }`-like objects. */
  warnings?: Array<Record<string, unknown>>;
};

/**
 * Error thrown by appleNewsRequest when Apple News returns a non-2xx response.
 * Exposes the HTTP status and the first error code from the response body (e.g. `WRONG_REVISION`)
 * so callers can branch structurally instead of matching on the message string.
 */
export class AppleNewsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** The `value` field from the first error object (e.g. the duplicate article ID for DUPLICATE_ARTICLE_FOUND). */
  readonly value: string | null;
  readonly body: unknown;
  constructor(message: string, status: number, code: string | null, value: string | null, body: unknown) {
    super(message);
    this.name = 'AppleNewsApiError';
    this.status = status;
    this.code = code;
    this.value = value;
    this.body = body;
  }
}

/** Extracts the first error code from an Apple News error response body, if present. */
function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (first && typeof first === 'object' && typeof (first as { code?: unknown }).code === 'string') {
    return (first as { code: string }).code;
  }
  return null;
}

/** Extracts the first error value from an Apple News error response body, if present. */
function extractErrorValue(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (first && typeof first === 'object' && typeof (first as { value?: unknown }).value === 'string') {
    return (first as { value: string }).value;
  }
  return null;
}

/**
 * Builds the HHMAC Authorization header value.
 * Exported for testing. Canonical string = method + url + date [+ contentType + bodyStr].
 */
export async function createSignature(
  method: string,
  url: string,
  date: string,
  apiKeyId: string,
  apiKeySecret: string,
  contentType?: string,
  bodyStr?: string,
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(apiKeySecret), c => c.charCodeAt(0));
  let canonical = method + url + date;
  if (contentType && bodyStr !== undefined) {
    canonical += contentType + bodyStr;
  }
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
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
    const disposition =
      part.name === 'metadata'
        ? `Content-Disposition: form-data; name=${part.name}`
        : `Content-Disposition: form-data; name=${part.name}; filename=${part.name}`;
    const header = [
      `--${boundary}`,
      `Content-Type: ${part.mimeType}`,
      disposition,
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

/** Attempts to parse the response body as JSON; falls back to a status-based description. */
async function parseResponseBody(resp: Response): Promise<unknown> {
  const text = await resp.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return { rawBody: text || `(empty ${resp.status} response)` };
  }
}

/** Builds a user-facing error message from a parsed (or unparsed) response body. */
function formatErrorMessage(method: string, path: string, status: number, body: unknown): string {
  const code = extractErrorCode(body);
  const codeStr = code ? ` (${code})` : '';
  if (status === 429) return `Apple News rate limit exceeded${codeStr}. Please wait a moment and try again.`;
  if (status >= 500) return `Apple News is temporarily unavailable (HTTP ${status}${codeStr}). Please try again later.`;
  return `Apple News ${method} ${path} returned ${status}${codeStr}: ${JSON.stringify(body)}`;
}

const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 2;

async function appleNewsRequest(
  method: string,
  path: string,
  credentials: ApiCredentials,
  bodyParts?: MultipartPart[],
): Promise<unknown> {
  const url = `${APPLE_NEWS_BASE_URL}/${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const date = nowIso();

    let fetchInit: RequestInit;
    if (bodyParts) {
      const { body, contentType } = buildMultipartBody(bodyParts);
      const bodyStr = body.toString('utf8');
      const authorization = await createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret, contentType, bodyStr);
      fetchInit = {
        method,
        headers: { Authorization: authorization, 'Content-Type': contentType },
        body: bodyStr,
      };
    } else {
      const authorization = await createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret);
      fetchInit = { method, headers: { Authorization: authorization } };
    }

    const resp = await fetch(url, fetchInit);

    // Retry on 429 (rate limit) — respect Retry-After if present, otherwise use default delay.
    if (resp.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = resp.headers.get('Retry-After');
      const delayMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000) || RETRY_DELAY_MS : RETRY_DELAY_MS;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    if (method === 'DELETE') {
      if (!resp.ok && resp.status !== 404) {
        const body = await parseResponseBody(resp);
        throw new AppleNewsApiError(
          formatErrorMessage(method, path, resp.status, body),
          resp.status,
          extractErrorCode(body),
          extractErrorValue(body),
          body,
        );
      }
      return null;
    }
    if (!resp.ok) {
      const body = await parseResponseBody(resp);
      throw new AppleNewsApiError(
        formatErrorMessage(method, path, resp.status, body),
        resp.status,
        extractErrorCode(body),
        extractErrorValue(body),
        body,
      );
    }
    return await parseResponseBody(resp);
  }

  // Exhausted retries (only reachable via 429 loop).
  throw new AppleNewsApiError(
    'Apple News rate limit exceeded after multiple retries. Please try again later.',
    429,
    null,
    null,
    null,
  );
}

export type ArticleMetadataOptions = {
  isPreview?: boolean;
  isCandidateToBeFeatured?: boolean;
  isSponsored?: boolean;
  maturityRating?: string | null;
  /** Full Apple News section URLs (e.g. `https://news-api.apple.com/channels/{ch}/sections/{s}`). */
  sections?: string[];
};

/** Builds the metadata `data` object from options, omitting unset fields. */
function buildMetadataFields(options: ArticleMetadataOptions | undefined): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (options?.isPreview !== undefined) fields.isPreview = options.isPreview;
  if (options?.isCandidateToBeFeatured !== undefined) fields.isCandidateToBeFeatured = options.isCandidateToBeFeatured;
  if (options?.isSponsored !== undefined) fields.isSponsored = options.isSponsored;
  if (options?.maturityRating !== undefined) fields.maturityRating = options.maturityRating;
  if (options?.sections && options.sections.length > 0) fields.links = { sections: options.sections };
  return fields;
}

/** Creates a new article in Apple News. Returns the article data including id, revision, shareUrl. */
export async function createArticle(
  articleJson: unknown,
  credentials: ApiCredentials,
  options?: ArticleMetadataOptions,
): Promise<AppleNewsArticleData> {
  const parts: MultipartPart[] = [];
  const metadataFields = buildMetadataFields(options);
  if (Object.keys(metadataFields).length > 0) {
    parts.push({ name: 'metadata', data: JSON.stringify({ data: metadataFields }), mimeType: 'application/json' });
  }
  parts.push({ name: 'article.json', data: JSON.stringify(articleJson), mimeType: 'application/json' });
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
  options?: ArticleMetadataOptions,
): Promise<AppleNewsArticleData> {
  const metadataFields: Record<string, unknown> = { revision, ...buildMetadataFields(options) };
  const metadata = { data: metadataFields };
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
