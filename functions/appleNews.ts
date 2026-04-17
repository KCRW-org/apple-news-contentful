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
import { fieldNames, siteConfig } from '../src/lib/site';
import type { ArticleMetadataOptions } from '../src/lib/api';

type CmaContext = { cma: PlainClientAPI; spaceId: string; environmentId: string };

// States that Apple News returns while an article is still in-flight or has failed.
// NON_PERSIST_STATES: used in the publish write-back — don't trust these as the stored state;
//   fall back to existingData?.state (for updates) or 'LIVE' (for initial create).
// TRANSIENT_STATES: used in refreshStatus — never write back; Apple News is still processing.
// FAILURE_STATES: used in refreshStatus — only write back when isProvisional (initial create).
//   For updates, a failure leaves the article unchanged in Apple News, so we keep the stored state.
const NON_PERSIST_STATES = new Set(['PROCESSING', 'PROCESSING_UPDATE', 'FAILED_PROCESSING', 'FAILED_PROCESSING_UPDATE', 'DUPLICATE']);
const TRANSIENT_STATES = new Set(['PROCESSING', 'PROCESSING_UPDATE']);
const FAILURE_STATES = new Set(['FAILED_PROCESSING', 'FAILED_PROCESSING_UPDATE', 'DUPLICATE']);

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
  let environmentAlias: string | undefined;
  const options: { isPreview?: boolean; isCandidateToBeFeatured?: boolean; isSponsored?: boolean; confirmed?: boolean } = {};
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
      if (parsed.confirmed) options.confirmed = true;
      if (typeof parsed.environmentAlias === 'string') environmentAlias = parsed.environmentAlias;
    } else {
      action = body.action;
    }
  } catch {
    action = body.action;
  }

  if (!entryId) {
    return { success: false, error: 'Missing entryId in request body' } as PublishActionResult;
  }

  console.log('[appleNews] action=%s entryId=%s', action, entryId);

  const params = context.appInstallationParameters as AppInstallationParameters;
  const { apiKeyId, apiKeySecret, channelId } = params;
  const locale = params.locale ?? 'en-US';
  const fieldName = fieldNames.appleNewsData;

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
  // Only persists final states (LIVE, TAKEN_DOWN) back to the entry's appleNewsData field;
  // transient and failure states are returned to the client but not written.
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
        isProvisional: undefined, // cleared on first real state write
      };
      // Skip transient states (PROCESSING, PROCESSING_UPDATE) — Apple News is still processing.
      // Skip failure states on updates (isProvisional is false/absent) — the article presumably
      // remains live; show the error in the UI without overwriting the stored state.
      // Write failure states only on initial create (isProvisional=true) so the stored state
      // accurately reflects an article that never went live.
      const stateChanged = stored.state !== state || stored.revision !== fresh.revision;
      const isFailure = !!(state && FAILURE_STATES.has(state));
      const shouldPersist = stateChanged && (!state || !TRANSIENT_STATES.has(state)) && (!isFailure || stored.isProvisional === true);
      console.log('[appleNews] refreshStatus entryId=%s %s → %s persist=%s', entryId, stored.state ?? 'none', state ?? 'none', shouldPersist);
      if (shouldPersist) {
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
        // Check live state before deleting — surface conflicts and handle already-deleted articles.
        try {
          const fresh = await readArticle(data.id, credentials);
          const liveState = fresh.state as AppleNewsState | undefined;
          const stateChanged = liveState !== data.state;
          const revisionChanged = fresh.revision !== data.revision;
          if (!options.confirmed && (stateChanged || revisionChanged)) {
            console.log('[appleNews] conflict liveState=%s storedState=%s revisionChanged=%s entryId=%s', liveState, data.state, revisionChanged, entryId);
            return { success: false, conflict: { liveState: liveState!, storedState: data.state, revisionChanged } } as DeleteActionResult;
          }
        } catch (readErr) {
          // 404 means the article was already deleted from Apple News — skip the API delete.
          if (readErr instanceof AppleNewsApiError && readErr.status === 404) {
            console.log('[appleNews] delete 404-as-success (already deleted) entryId=%s articleId=%s', entryId, data.id);
            await clearAppleNewsData(entryId, locale, ctx, fieldName);
            return { success: true } as DeleteActionResult;
          }
          throw readErr;
        }
        await deleteArticle(data.id, credentials);
      }
      console.log('[appleNews] delete ok entryId=%s', entryId);
      await clearAppleNewsData(entryId, locale, ctx, fieldName);
      return { success: true } as DeleteActionResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[appleNews] error action=delete entryId=%s err=%s', entryId, message);
      return { success: false, error: message } as DeleteActionResult;
    }
  }

  // ── publish / update ───────────────────────────────────────────────────────
  // Guard: reject unrecognized actions so they never fall through to the publish flow.
  if (action !== 'publish' && action != null) {
    return { success: false, error: `Unknown action: ${String(action)}` } as PublishActionResult;
  }

  if (!apiKeyId || !apiKeySecret || !channelId) {
    return { success: false, error: 'Missing Apple News credentials. Check the app configuration.' } as PublishActionResult;
  }
  const { cdaToken } = params;
  if (!cdaToken) {
    return { success: false, error: 'Content Delivery API token not configured. Add it in the app settings.' } as PublishActionResult;
  }
  const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
  const isPreview = options.isPreview ?? false;

  // The App Actions context always provides the resolved environment ID (e.g.
  // "goji-testing-2026-01-07"), but CDA API keys are typically granted access to
  // the alias (e.g. "goji-testing"), not the underlying environment.  Resolve the
  // alias so the CDA call uses a name the key recognizes.
  // The App Actions context provides the resolved environment ID (e.g.
  // "goji-testing-2026-01-07"), but CDA API keys are typically granted access to
  // the alias (e.g. "goji-testing"), not the underlying environment.  The UI sends
  // sdk.ids.environmentAlias when available so the CDA call uses the alias name.
  const cdaEnvironmentId = environmentAlias ?? environmentId;

  // CDA-backed source — the Content Delivery API only returns published entries, so
  // draft changes in Contentful can never leak into the article we ship to Apple News.
  const entrySource = createDeliveryEntrySource({ token: cdaToken, spaceId, environmentId: cdaEnvironmentId, locale });

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

    const rawTitle = (entryForCheck.fields as Record<string, Record<string, unknown>>)[fieldNames.title]?.[locale];
    if (!rawTitle) {
      return { success: false, error: 'Entry title is empty. Set a title in Contentful before sending to Apple News.' } as PublishActionResult;
    }

    // ── Pre-flight conflict check ─────────────────────────────────────────────
    // Done before the expensive resolveStory/buildArticle work so we can return
    // early when the user needs to confirm an external change first.
    // We also fetch the fresh revision here (needed to avoid 409 on update) and
    // carry it forward so we don't need a second readArticle call later.
    const { data: existingData } = await getAppleNewsData(entryId, locale, ctx, fieldName);

    // Track whether the stored article ID was found to be deleted in Apple News — in that
    // case we create a new article (after the user confirms) rather than trying to update.
    let storedArticleDeleted = false;
    // Fresh Apple News article data fetched before the update — carries current revision.
    let freshArticle: AppleNewsArticleData | null = null;

    if (existingData?.id) {
      try {
        freshArticle = await readArticle(existingData.id, credentials);
      } catch (readErr) {
        if (readErr instanceof AppleNewsApiError && readErr.status === 404) {
          // Article was deleted from Apple News directly. Ask the user to confirm a re-publish.
          if (!options.confirmed) {
            console.log('[appleNews] conflict articleDeleted entryId=%s articleId=%s', entryId, existingData.id);
            return { success: false, conflict: { articleDeleted: true } } as PublishActionResult;
          }
          storedArticleDeleted = true;
        } else {
          const detail = readErr instanceof Error ? readErr.message : String(readErr);
          throw new Error(
            `Could not fetch the current article revision from Apple News (article ${existingData.id}). Details: ${detail}`,
          );
        }
      }
      if (freshArticle !== null) {
        // Conflict check: surface external changes before overwriting with our content.
        // Trigger when the live state differs from stored (always checked — storedState may
        // be undefined for old records) OR when the revision changed (meaning someone edited
        // or published the article outside Contentful, e.g. promoting a preview to live).
        const liveState = freshArticle.state as AppleNewsState | undefined;
        const stateChanged = liveState !== existingData.state;
        const revisionChanged = freshArticle.revision !== existingData.revision;
        if (!options.confirmed && (stateChanged || revisionChanged)) {
          console.log('[appleNews] conflict liveState=%s storedState=%s revisionChanged=%s entryId=%s', liveState, existingData.state, revisionChanged, entryId);
          return { success: false, conflict: { liveState: liveState!, storedState: existingData.state, revisionChanged } } as PublishActionResult;
        }
      }
    }

    // ── Resolve content and build ANF ─────────────────────────────────────────
    const story = await resolveStory(entryId, params, entrySource);
    const warnings: string[] = [...story.warnings];

    const articleJson = buildArticle(entryId, story, params);

    const entryMetadata = siteConfig.resolveArticleMetadata(story);

    // Resolve Apple News sections from the config mapping + entry's category IDs.
    // An empty-string key ("") in the mapping is the default section, always included.
    let sections: string[] | undefined;
    if (params.sectionMappingJson) {
      try {
        const mapping = JSON.parse(params.sectionMappingJson) as Record<string, string>;
        const toUrl = (sid: string) => `https://news-api.apple.com/sections/${sid}`;
        const sectionUrls: string[] = [];
        const defaultSid = mapping[''];
        if (defaultSid) sectionUrls.push(toUrl(defaultSid));
        for (const catId of story.categoryIds) {
          const sid = mapping[catId];
          if (sid && sid !== defaultSid) sectionUrls.push(toUrl(sid));
        }
        if (sectionUrls.length > 0) sections = sectionUrls;
      } catch { /* invalid JSON — silently skip */ }
    }

    const metadataOptions: ArticleMetadataOptions = {
      ...entryMetadata,
      isPreview,
      sections,
      // UI selections override entry-derived values
      ...(options.isCandidateToBeFeatured !== undefined ? { isCandidateToBeFeatured: options.isCandidateToBeFeatured } : undefined),
      ...(options.isSponsored !== undefined ? { isSponsored: options.isSponsored } : undefined),
    };

    // ── Create or update ──────────────────────────────────────────────────────
    let articleData: AppleNewsArticleData;
    if (existingData?.id && freshArticle !== null) {
      try {
        articleData = await updateArticle(existingData.id, freshArticle.revision, articleJson, credentials, metadataOptions);
      } catch (err) {
        // Version-conflict auto-retry: fetch the latest revision once more and try again.
        // Any second failure (including a second WRONG_REVISION) surfaces to the user.
        if (err instanceof AppleNewsApiError && err.code === 'WRONG_REVISION') {
          const retryRead = await readArticle(existingData.id, credentials);
          warnings.push(
            `Apple News reported a revision conflict (expected ${freshArticle.revision}, current ${retryRead.revision}). ` +
              `The article was updated concurrently; retrying once with the current revision.`,
          );
          articleData = await updateArticle(existingData.id, retryRead.revision, articleJson, credentials, metadataOptions);
        } else {
          throw err;
        }
      }
    } else if (existingData?.id && storedArticleDeleted) {
      // confirmed after articleDeleted conflict: create a brand-new article
      articleData = await createArticle(articleJson, credentials, metadataOptions);
      warnings.push('The previous Apple News article was no longer found — published as a new article.');
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

    const rawState = articleData.state as AppleNewsState | undefined;
    const data: AppleNewsData = {
      id: articleData.id,
      revision: articleData.revision,
      publishedAt: articleData.publishedAt ?? new Date().toISOString(),
      shareUrl: articleData.shareUrl,
      // If Apple News returns a transient/failure state, assume LIVE so that a successful
      // poll won't see a state change and trigger a second write-back. Failure states on
      // initial create are written by refreshStatus (isProvisional=true); on updates they
      // are not written — the article presumably remains live in Apple News.
      state: rawState && !NON_PERSIST_STATES.has(rawState) ? rawState : (existingData?.state ?? 'LIVE'),
      // Mark initial creates as provisional so refreshStatus knows to persist failure states.
      // Cleared by refreshStatus on the first real state write.
      isProvisional: existingData?.id ? undefined : true,
      isPreview: isPreview || undefined,
      // Store publishedVersion at click time (v1). Our write + re-publish adds exactly +2,
      // so needsUpdate checks entrySys.publishedVersion > contentfulVersion + 2 to ignore
      // our own field write and only flag when actual content has been re-published.
      contentfulVersion: sys.publishedVersion ?? undefined,
      isCandidateToBeFeatured: metadataOptions.isCandidateToBeFeatured ?? undefined,
      isSponsored: metadataOptions.isSponsored ?? undefined,
    };
    await writeAppleNewsData(entryId, locale, data, ctx, fieldName);

    console.log('[appleNews] publish ok articleId=%s state=%s isPreview=%s entryId=%s', data.id, data.state ?? 'none', isPreview, entryId);
    return {
      success: true,
      shareUrl: data.shareUrl,
      data,
      warnings: [...warnings, ...summarizeAppleWarnings(articleData.warnings)],
    } as PublishActionResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[appleNews] error action=publish entryId=%s err=%s', entryId, message);
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
