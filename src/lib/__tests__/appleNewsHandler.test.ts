/**
 * Tests for conflict detection logic in functions/appleNews.ts.
 *
 * The handler is tested by mocking the Apple News API (fetch) and the CMA client.
 * We focus on the conflict detection paths — state mismatch, revision mismatch,
 * 404 articleDeleted, confirmed bypass, and 404 delete-as-success.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { appleNewsHandler } from '../../../functions/appleNews';
import { AppleNewsApiError } from '../api';
import type { PublishActionResult, DeleteActionResult } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const BASE_CREDENTIALS = {
  apiKeyId: 'key-id',
  apiKeySecret: 'dGVzdA==', // base64("test")
  channelId: 'chan-1',
  cdaToken: 'cda-token',
  locale: 'en-US',
};

const STORED_DATA = {
  id: 'art-123',
  revision: 'rev-1',
  shareUrl: 'https://apple.news/art-123',
  publishedAt: '2024-01-01T00:00:00Z',
  state: 'LIVE' as const,
  contentfulVersion: 5,
};

/** Minimal event body for the action handler. */
function makeEvent(action: string, entryId = 'entry-1') {
  return { body: { action, entryId } };
}

/** Minimal App Action context. */
function makeContext(overrides: {
  storedData?: typeof STORED_DATA | null;
  publishedVersion?: number;
  entryVersion?: number;
  params?: Record<string, string>;
}) {
  const {
    storedData = STORED_DATA,
    publishedVersion = 5,
    entryVersion = publishedVersion != null ? publishedVersion + 1 : 1,
    params = {},
  } = overrides;

  const entryFields: Record<string, Record<string, unknown>> = {
    title: { 'en-US': 'Test Story' },
  };
  if (storedData !== null) {
    entryFields.appleNewsData = { 'en-US': storedData };
  }

  const cma = {
    entry: {
      get: vi.fn().mockResolvedValue({
        sys: { version: entryVersion, publishedVersion },
        fields: entryFields,
      }),
      update: vi.fn().mockResolvedValue({
        sys: { version: entryVersion + 1, publishedVersion },
        fields: entryFields,
      }),
      publish: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    cma,
    spaceId: 'space-1',
    environmentId: 'master',
    appInstallationParameters: { ...BASE_CREDENTIALS, ...params },
  };
}

/** Mocks a single Apple News GET /articles/{id} response. */
function mockReadArticle(data: { id: string; revision: string; state?: string; shareUrl?: string }) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify({ data }),
  });
}

/** Mocks a 404 Apple News response. */
function mock404() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    headers: new Headers(),
    text: async () => JSON.stringify({ errors: [{ code: 'ARTICLE_NOT_FOUND', message: 'not found' }] }),
  });
}

/** Minimal CDA collection response for resolveStory. */
function cdaEntryResponse(entryId: string) {
  return {
    items: [{
      sys: { id: entryId, contentType: { sys: { id: 'story' } } },
      fields: { title: 'Test Story' },
    }],
  };
}

/**
 * URL-routing fetch mock: routes CDA calls (cdn.contentful.com) vs Apple News API calls.
 * `appleNewsCalls` is an array of responses returned in order for Apple News requests.
 */
function makeRoutedFetch(entryId: string, appleNewsCalls: Array<{ ok: boolean; status: number; body: unknown }>) {
  let appleNewsIdx = 0;
  return vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('contentful.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => cdaEntryResponse(entryId),
        text: async () => JSON.stringify(cdaEntryResponse(entryId)),
      });
    }
    // Apple News API call
    const call = appleNewsCalls[appleNewsIdx++] ?? { ok: true, status: 200, body: {} };
    return Promise.resolve({
      ok: call.ok,
      status: call.status,
      headers: new Headers(),
      text: async () => JSON.stringify(call.body),
    });
  });
}

// ── delete: conflict detection ────────────────────────────────────────────────

describe('delete action — conflict detection', () => {
  it('returns conflict when live state differs from stored state', async () => {
    global.fetch = mockReadArticle({
      id: STORED_DATA.id,
      revision: STORED_DATA.revision, // revision same, but state different
      state: 'TAKEN_DOWN',
      shareUrl: STORED_DATA.shareUrl,
    });

    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.liveState).toBe('TAKEN_DOWN');
    expect(result.conflict?.storedState).toBe('LIVE');
    expect(result.conflict?.revisionChanged).toBe(false);
  });

  it('returns conflict when revision changed even if state is the same', async () => {
    global.fetch = mockReadArticle({
      id: STORED_DATA.id,
      revision: 'rev-999', // different revision
      state: STORED_DATA.state,
      shareUrl: STORED_DATA.shareUrl,
    });

    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.revisionChanged).toBe(true);
  });

  it('returns success when confirmed bypasses conflict check', async () => {
    // First fetch: readArticle (state + revision mismatch)
    // Second fetch: deleteArticle (DELETE → 204)
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ data: { id: STORED_DATA.id, revision: 'rev-999', state: 'TAKEN_DOWN', shareUrl: STORED_DATA.shareUrl } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      }) as typeof fetch;

    const event = makeEvent(JSON.stringify({ name: 'delete', confirmed: true }));
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(result.conflict).toBeUndefined();
  });

  it('treats 404 from Apple News as success — already deleted', async () => {
    global.fetch = mock404();

    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(result.conflict).toBeUndefined();
    // appleNewsData should have been cleared
    expect(ctx.cma.entry.update).toHaveBeenCalled();
  });

  it('succeeds without conflict when no stored data (already unpublished)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: null });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled(); // no Apple News call needed
  });
});

// ── auto-publish guard after appleNewsData writes ─────────────────────────────

describe('auto-publish guard', () => {
  /** readArticle matching stored state/revision (no conflict), then DELETE 204. */
  function mockDeleteFlow() {
    return vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ data: { id: STORED_DATA.id, revision: STORED_DATA.revision, state: STORED_DATA.state, shareUrl: STORED_DATA.shareUrl } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      }) as typeof fetch;
  }

  it('delete does NOT auto-publish when the entry has pending draft changes', async () => {
    global.fetch = mockDeleteFlow();

    const event = makeEvent('delete');
    // version = publishedVersion + 3 → entry has draft changes beyond the published version
    const ctx = makeContext({ storedData: STORED_DATA, publishedVersion: 5, entryVersion: 8 });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(ctx.cma.entry.update).toHaveBeenCalled();   // field clear still written
    expect(ctx.cma.entry.publish).not.toHaveBeenCalled(); // drafts must not go live
  });

  it('delete does NOT auto-publish when the entry was never published', async () => {
    global.fetch = mockDeleteFlow();

    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: STORED_DATA, publishedVersion: undefined as never, entryVersion: 4 });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(ctx.cma.entry.update).toHaveBeenCalled();
    expect(ctx.cma.entry.publish).not.toHaveBeenCalled();
  });

  it('delete auto-publishes when the entry is clean (no pending drafts)', async () => {
    global.fetch = mockDeleteFlow();

    const event = makeEvent('delete');
    const ctx = makeContext({ storedData: STORED_DATA, publishedVersion: 5, entryVersion: 6 });
    const result = await appleNewsHandler(event as never, ctx as never) as DeleteActionResult;

    expect(result.success).toBe(true);
    expect(ctx.cma.entry.publish).toHaveBeenCalled();
  });
});

// ── publish/update: conflict detection ───────────────────────────────────────

describe('publish action — conflict detection on update', () => {
  const successArticleResult = {
    data: {
      id: STORED_DATA.id,
      revision: 'rev-new',
      shareUrl: STORED_DATA.shareUrl,
      publishedAt: '2024-06-01T00:00:00Z',
      state: 'PROCESSING',
    },
  };

  it('returns conflict when live state differs from stored', async () => {
    // readArticle returns state=TAKEN_DOWN → conflict, returns before resolveStory
    global.fetch = mockReadArticle({
      id: STORED_DATA.id,
      revision: STORED_DATA.revision,
      state: 'TAKEN_DOWN',
      shareUrl: STORED_DATA.shareUrl,
    });

    const event = makeEvent('publish');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.liveState).toBe('TAKEN_DOWN');
    expect(result.conflict?.storedState).toBe('LIVE');
    expect(result.conflict?.revisionChanged).toBe(false);
  });

  it('returns conflict when revision differs even if state matches', async () => {
    global.fetch = mockReadArticle({
      id: STORED_DATA.id,
      revision: 'rev-external',
      state: STORED_DATA.state,
      shareUrl: STORED_DATA.shareUrl,
    });

    const event = makeEvent('publish');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.revisionChanged).toBe(true);
  });

  it('returns conflict when stored state is undefined (legacy records)', async () => {
    const storedNoState = { ...STORED_DATA, state: undefined as never };
    global.fetch = mockReadArticle({
      id: STORED_DATA.id,
      revision: STORED_DATA.revision,
      state: 'LIVE',
      shareUrl: STORED_DATA.shareUrl,
    });

    const event = makeEvent('publish');
    const ctx = makeContext({ storedData: storedNoState });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.liveState).toBe('LIVE');
    expect(result.conflict?.storedState).toBeUndefined();
  });

  it('proceeds and succeeds when confirmed is true', async () => {
    // Fetch order: readArticle (Apple News GET), CDA calls (resolveStory), updateArticle (Apple News PUT)
    global.fetch = makeRoutedFetch('entry-1', [
      { ok: true, status: 200, body: { data: { id: STORED_DATA.id, revision: 'rev-external', state: 'TAKEN_DOWN', shareUrl: STORED_DATA.shareUrl } } },
      { ok: true, status: 200, body: successArticleResult },
    ]);

    const event = makeEvent(JSON.stringify({ name: 'publish', confirmed: true }));
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(true);
    expect(result.conflict).toBeUndefined();
    expect(result.shareUrl).toBeDefined();
  });

  it('returns articleDeleted conflict when article is 404 in Apple News', async () => {
    global.fetch = mock404();

    const event = makeEvent('publish');
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.articleDeleted).toBe(true);
    expect((result.conflict as { liveState?: unknown }).liveState).toBeUndefined();
  });

  it('creates a new article when confirmed after articleDeleted conflict', async () => {
    const newArticleResult = {
      data: {
        id: 'art-new',
        revision: 'rev-new',
        shareUrl: 'https://apple.news/art-new',
        publishedAt: '2024-06-01T00:00:00Z',
        state: 'PROCESSING',
      },
    };
    // Fetch order: readArticle (404), CDA calls, createArticle (success)
    global.fetch = makeRoutedFetch('entry-1', [
      { ok: false, status: 404, body: { errors: [{ code: 'ARTICLE_NOT_FOUND' }] } },
      { ok: true, status: 201, body: newArticleResult },
    ]);

    const event = makeEvent(JSON.stringify({ name: 'publish', confirmed: true }));
    const ctx = makeContext({ storedData: STORED_DATA });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(true);
    expect(result.shareUrl).toContain('art-new');
    expect(result.warnings?.some(w => w.includes('no longer found'))).toBe(true);
  });

  it('returns no conflict when no existing article (first publish)', async () => {
    const newArticleResult = {
      data: {
        id: 'art-brand-new',
        revision: 'rev-1',
        shareUrl: 'https://apple.news/art-brand-new',
        publishedAt: '2024-06-01T00:00:00Z',
        state: 'PROCESSING',
      },
    };
    // Fetch order: CDA calls (no readArticle since no existing data), createArticle
    global.fetch = makeRoutedFetch('entry-1', [
      { ok: true, status: 201, body: newArticleResult },
    ]);

    const event = makeEvent('publish');
    const ctx = makeContext({ storedData: null });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(true);
    expect(result.conflict).toBeUndefined();
  });
});

// ── unknown action guard ──────────────────────────────────────────────────────

describe('unknown action guard', () => {
  it('returns an error for unrecognized actions without touching Apple News', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const event = makeEvent('peekStatus');
    const ctx = makeContext({ storedData: null });
    const result = await appleNewsHandler(event as never, ctx as never) as PublishActionResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
