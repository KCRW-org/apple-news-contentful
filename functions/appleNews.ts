import type { PlainClientAPI } from 'contentful-management';
import type { AppActionHandler } from './types';
import type {
  AppInstallationParameters,
  AppleNewsData,
  AppleNewsState,
  PublishActionResult,
  CheckStatusResult,
  DeleteActionResult,
} from '../src/types';
import type { ApiCredentials, AppleNewsArticleData } from '../src/lib/api';
import { createArticle, readArticle, updateArticle, deleteArticle, AppleNewsApiError } from '../src/lib/api';
import { resolveStory } from '../src/lib/fetch';
import { createDeliveryEntrySource } from '../src/lib/entrySource';
import { buildArticle } from '../src/lib/article';
import { FIELD_NAMES, resolveArticleMetadata } from '../src/lib/conventions';
import type { ArticleMetadataOptions } from '../src/lib/api';

type CmaContext = { cma: PlainClientAPI; spaceId: string; environmentId: string };

async function getAppleNewsData(
  entryId: string,
  locale: string,
  ctx: CmaContext,
  fieldName: string,
): Promise<{ data: AppleNewsData | null; publishedVersion?: number }> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const publishedVersion = (entry.sys as { publishedVersion?: number }).publishedVersion;
  const raw = (entry.fields as Record<string, Record<string, unknown>>)[fieldName]?.[locale];
  if (!raw) return { data: null, publishedVersion };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { data: parsed as AppleNewsData, publishedVersion };
  } catch {
    return { data: null, publishedVersion };
  }
}

async function writeAppleNewsData(
  entryId: string,
  locale: string,
  data: AppleNewsData,
  ctx: CmaContext,
  fieldName: string,
): Promise<void> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
  if (!fields[fieldName]) fields[fieldName] = {};
  fields[fieldName][locale] = data;
  const updated = await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    entry,
  );
  // Re-publish immediately so the appleNewsData write doesn't leave a pending draft.
  // We validated before publishing that the entry had no unpublished changes, so the
  // only new draft change is this field. A publish failure here is non-fatal — the
  // Apple News operation already succeeded; the entry will just have one pending draft.
  try {
    await ctx.cma.entry.publish(
      { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
      updated,
    );
  } catch (publishErr) {
    console.warn('[appleNews] Entry update succeeded but auto-publish failed:', publishErr);
  }
}

async function clearAppleNewsData(
  entryId: string,
  locale: string,
  ctx: CmaContext,
  fieldName: string,
): Promise<void> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
  if (fields[fieldName]) {
    delete fields[fieldName][locale];
  }
  const updated = await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    entry,
  );
  try {
    await ctx.cma.entry.publish(
      { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
      updated,
    );
  } catch (publishErr) {
    console.warn('[appleNews] Entry update succeeded but auto-publish failed:', publishErr);
  }
}

export const appleNewsHandler: AppActionHandler = async (event, context) => {
  const body = event.body as {
    action?: string;
    entryId?: string;
  };
  const { entryId } = body;

  // `action` is either a plain string (e.g. "publish") or a JSON object encoded as a string
  // (e.g. '{"name":"publish","isPreview":true}') when extra options are needed, so that we
  // don't require additional declared parameters in the App Action schema.
  let action: string | undefined;
  const options: { isPreview?: boolean; isCandidateToBeFeatured?: boolean; isSponsored?: boolean } = {};
  try {
    const parsed = JSON.parse(body.action ?? '');
    if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
      action = parsed.name;
      if (parsed.isPreview) options.isPreview = true;
      // Use !== undefined so explicit `false` passes through — letting the editor
      // unset a previously-set flag, while the sidebar (which omits these entirely)
      // leaves them at their current stored value.
      if (parsed.isCandidateToBeFeatured !== undefined) options.isCandidateToBeFeatured = !!parsed.isCandidateToBeFeatured;
      if (parsed.isSponsored !== undefined) options.isSponsored = !!parsed.isSponsored;
    } else {
      action = body.action;
    }
  } catch {
    action = body.action;
  }

  if (!entryId) {
    return { success: false, error: 'Missing entryId in request body' } as PublishActionResult;
  }

  const params = context.appInstallationParameters as AppInstallationParameters;
  const { apiKeyId, apiKeySecret, channelId } = params;
  const locale = params.locale ?? 'en-US';
  const fieldName = FIELD_NAMES.appleNewsData;

  const { spaceId, environmentId, cma } = context;
  if (!cma) {
    return { success: false, error: 'CMA client not available in function context' } as PublishActionResult;
  }
  const ctx: CmaContext = { cma, spaceId, environmentId };

  // ── checkStatus ────────────────────────────────────────────────────────────
  // Fast path: read the entry's stored appleNewsData field only. Use this on mount.
  if (action === 'checkStatus') {
    try {
      const { data } = await getAppleNewsData(entryId, locale, ctx, fieldName);
      return {
        published: !!data?.id,
        shareUrl: data?.shareUrl,
        data: data ?? undefined,
        state: data?.state,
      } as CheckStatusResult;
    } catch {
      return { published: false } as CheckStatusResult;
    }
  }

  // ── refreshStatus ──────────────────────────────────────────────────────────
  // Polls Apple News for the latest article state (PROCESSING → LIVE | FAILED_PROCESSING).
  // Updates the stored appleNewsData field with the current state + revision so that
  // subsequent mounts read the latest value without another Apple News round-trip.
  if (action === 'refreshStatus') {
    if (!apiKeyId || !apiKeySecret || !channelId) {
      return { published: false, error: 'Missing Apple News credentials in app configuration.' } as CheckStatusResult;
    }
    const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
    try {
      const { data: stored, publishedVersion: currentPV } = await getAppleNewsData(entryId, locale, ctx, fieldName);
      if (!stored?.id) {
        return { published: false } as CheckStatusResult;
      }
      const fresh = await readArticle(stored.id, credentials);
      const state = fresh.state as AppleNewsState | undefined;
      const updated: AppleNewsData = {
        ...stored,
        revision: fresh.revision,
        shareUrl: fresh.shareUrl || stored.shareUrl,
        state,
        contentfulVersion: currentPV ?? stored.contentfulVersion,
      };
      // Only persist when something meaningful changed (state transition, new revision)
      // to avoid unnecessary version bumps on the entry (+2 per write+publish cycle).
      const stateChanged = stored.state !== state || stored.revision !== fresh.revision;
      if (stateChanged) {
        try {
          await writeAppleNewsData(entryId, locale, updated, ctx, fieldName);
        } catch (writeErr) {
          console.warn('[appleNews] Failed to persist refreshed status:', writeErr);
        }
      }
      return {
        published: true,
        shareUrl: updated.shareUrl,
        data: updated,
        state,
        warnings: summarizeAppleWarnings(fresh.warnings),
      } as CheckStatusResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { published: true, error: message } as CheckStatusResult;
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!apiKeyId || !apiKeySecret || !channelId) {
      return { success: false, error: 'Missing Apple News credentials in app configuration.' } as DeleteActionResult;
    }
    const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
    try {
      const { data } = await getAppleNewsData(entryId, locale, ctx, fieldName);
      if (data?.id) {
        await deleteArticle(data.id, credentials);
      }
      await clearAppleNewsData(entryId, locale, ctx, fieldName);
      return { success: true } as DeleteActionResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message } as DeleteActionResult;
    }
  }

  // ── publish / update ───────────────────────────────────────────────────────
  if (!apiKeyId || !apiKeySecret || !channelId) {
    return { success: false, error: 'Missing Apple News credentials. Check the app configuration.' } as PublishActionResult;
  }
  const { cdaToken } = params;
  if (!cdaToken) {
    return { success: false, error: 'Content Delivery API token not configured. Add it in the app settings.' } as PublishActionResult;
  }
  const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
  const isPreview = options.isPreview ?? false;
  // CDA-backed source — the Content Delivery API only returns published entries, so
  // draft changes in Contentful can never leak into the article we ship to Apple News.
  const entrySource = createDeliveryEntrySource({ token: cdaToken, spaceId, environmentId, locale });

  try {
    // Validate the entry is published and has no pending draft changes before resolving.
    // cma.entry.get() returns the current version (draft or published). When
    // sys.version === sys.publishedVersion + 1, no draft changes exist and the
    // fetched fields are exactly the published fields.
    const entryForCheck = await ctx.cma.entry.get({
      spaceId: ctx.spaceId,
      environmentId: ctx.environmentId,
      entryId,
    });
    const sys = entryForCheck.sys as { version: number; publishedVersion?: number | null };
    if (sys.publishedVersion == null) {
      return { success: false, error: 'Entry must be published in Contentful before sending to Apple News.' } as PublishActionResult;
    }
    if (sys.version > sys.publishedVersion + 1) {
      return { success: false, error: 'Entry has unpublished changes. Publish all changes in Contentful before sending to Apple News.' } as PublishActionResult;
    }

    const rawTitle = (entryForCheck.fields as Record<string, Record<string, unknown>>)[FIELD_NAMES.title]?.[locale];
    if (!rawTitle) {
      return { success: false, error: 'Entry title is empty. Set a title in Contentful before sending to Apple News.' } as PublishActionResult;
    }

    const story = await resolveStory(entryId, params, entrySource);
    const warnings: string[] = [...story.warnings];

    const articleJson = buildArticle(entryId, story, params);

    const entryMetadata = resolveArticleMetadata(story);
    const metadataOptions: ArticleMetadataOptions = {
      ...entryMetadata,
      isPreview,
      // UI selections override entry-derived values
      ...(options.isCandidateToBeFeatured !== undefined ? { isCandidateToBeFeatured: options.isCandidateToBeFeatured } : undefined),
      ...(options.isSponsored !== undefined ? { isSponsored: options.isSponsored } : undefined),
    };

    // Check if already published (update vs create)
    const { data: existingData } = await getAppleNewsData(entryId, locale, ctx, fieldName);

    let articleData: AppleNewsArticleData;
    if (existingData?.id) {
      // Always refresh revision before update to avoid 409 conflicts.
      let fresh: AppleNewsArticleData;
      try {
        fresh = await readArticle(existingData.id, credentials);
      } catch (readErr) {
        const detail = readErr instanceof Error ? readErr.message : String(readErr);
        throw new Error(
          `Could not fetch the current article revision from Apple News (article ${existingData.id}). ` +
            `The article may have been deleted from Apple News directly. ` +
            `Try deleting from the sidebar and re-publishing. Details: ${detail}`,
        );
      }
      try {
        articleData = await updateArticle(existingData.id, fresh.revision, articleJson, credentials, metadataOptions);
      } catch (err) {
        // Version-conflict auto-retry: fetch the latest revision once more and try again.
        // Any second failure (including a second WRONG_REVISION) surfaces to the user.
        if (err instanceof AppleNewsApiError && err.code === 'WRONG_REVISION') {
          const retryRead = await readArticle(existingData.id, credentials);
          warnings.push(
            `Apple News reported a revision conflict (expected ${fresh.revision}, current ${retryRead.revision}). ` +
              `The article was updated concurrently; retrying once with the current revision.`,
          );
          articleData = await updateArticle(existingData.id, retryRead.revision, articleJson, credentials, metadataOptions);
        } else {
          throw err;
        }
      }
    } else {
      try {
        articleData = await createArticle(articleJson, credentials, metadataOptions);
      } catch (err) {
        // DUPLICATE_ARTICLE_FOUND: article exists in Apple News but appleNewsData was cleared
        // (e.g. field was manually wiped or entry was re-created). Apple returns the existing
        // article ID in errors[0].value — recover by reading the current revision and updating.
        if (err instanceof AppleNewsApiError && err.code === 'DUPLICATE_ARTICLE_FOUND' && err.value) {
          const existingId = err.value;
          const existingRevision = await readArticle(existingId, credentials);
          warnings.push(
            `Article already existed in Apple News (ID: ${existingId}) but was detached from this entry. ` +
              `Reconnected and updated with the latest content.`,
          );
          articleData = await updateArticle(existingId, existingRevision.revision, articleJson, credentials, metadataOptions);
        } else {
          throw err;
        }
      }
    }

    const data: AppleNewsData = {
      id: articleData.id,
      revision: articleData.revision,
      publishedAt: articleData.publishedAt ?? new Date().toISOString(),
      shareUrl: articleData.shareUrl,
      state: articleData.state as AppleNewsState | undefined,
      isPreview: isPreview || undefined,
      // Store publishedVersion at click time (v1). Our write + re-publish adds exactly +2,
      // so needsUpdate checks entrySys.publishedVersion > contentfulVersion + 2 to ignore
      // our own field write and only flag when actual content has been re-published.
      contentfulVersion: sys.publishedVersion ?? undefined,
      isCandidateToBeFeatured: metadataOptions.isCandidateToBeFeatured ?? undefined,
      isSponsored: metadataOptions.isSponsored ?? undefined,
    };
    await writeAppleNewsData(entryId, locale, data, ctx, fieldName);

    return {
      success: true,
      shareUrl: data.shareUrl,
      data,
      warnings: [...warnings, ...summarizeAppleWarnings(articleData.warnings)],
    } as PublishActionResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message } as PublishActionResult;
  }
};

/** Flattens Apple News `warnings[]` response entries into short human-readable strings. */
function summarizeAppleWarnings(warnings: Array<Record<string, unknown>> | undefined): string[] {
  if (!warnings || warnings.length === 0) return [];
  return warnings.map(w => {
    const msg = typeof w.message === 'string' ? w.message : JSON.stringify(w);
    const keyPath = typeof w.keyPath === 'string' ? ` (${w.keyPath})` : '';
    return `Apple News: ${msg}${keyPath}`;
  });
}
