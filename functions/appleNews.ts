import type { PlainClientAPI } from 'contentful-management';
import type { AppActionHandler } from './types';
import type {
  AppInstallationParameters,
  AppleNewsData,
  PublishActionResult,
  CheckStatusResult,
  DeleteActionResult,
} from '../src/types';
import type { ApiCredentials } from '../src/lib/api';
import { createArticle, readArticle, updateArticle, deleteArticle } from '../src/lib/api';
import { resolveStory } from '../src/lib/fetch';
import { buildArticle } from '../src/lib/article';

type CmaContext = { cma: PlainClientAPI; spaceId: string; environmentId: string };

async function getAppleNewsData(
  entryId: string,
  locale: string,
  ctx: CmaContext,
  fieldName: string,
): Promise<AppleNewsData | null> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const raw = (entry.fields as Record<string, Record<string, unknown>>)[fieldName]?.[locale];
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed as AppleNewsData;
  } catch {
    return null;
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
  if (!fields[fieldName]) {
    throw new Error(
      `Field "${fieldName}" not found on this content type. Add a JSON field named "${fieldName}" to the Story content type before using this app.`,
    );
  }
  fields[fieldName][locale] = data;
  await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    entry,
  );
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
  await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    entry,
  );
}

export const appleNewsHandler: AppActionHandler = async (event, context) => {
  const body = event.body as { action?: string; entryId?: string };
  const { action, entryId } = body;

  if (!entryId) {
    return { success: false, error: 'Missing entryId in request body' } as PublishActionResult;
  }

  const params = context.appInstallationParameters as AppInstallationParameters;
  const { apiKeyId, apiKeySecret, channelId } = params;
  const locale = params.locale ?? 'en-US';
  const fieldName = 'appleNewsData'; // from FIELD_NAMES.appleNewsData in conventions.ts

  const { spaceId, environmentId, cma } = context;
  if (!cma) {
    return { success: false, error: 'CMA client not available in function context' } as PublishActionResult;
  }
  const ctx: CmaContext = { cma, spaceId, environmentId };

  // ── checkStatus ────────────────────────────────────────────────────────────
  if (action === 'checkStatus') {
    try {
      const data = await getAppleNewsData(entryId, locale, ctx, fieldName);
      return { published: !!data?.id, shareUrl: data?.shareUrl } as CheckStatusResult;
    } catch {
      return { published: false } as CheckStatusResult;
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!apiKeyId || !apiKeySecret || !channelId) {
      return { success: false, error: 'Missing Apple News credentials in app configuration.' } as DeleteActionResult;
    }
    const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
    try {
      const data = await getAppleNewsData(entryId, locale, ctx, fieldName);
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
  const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };

  try {
    const story = await resolveStory(entryId, params, ctx);
    const articleJson = buildArticle(entryId, story, params);

    // Check if already published (update vs create)
    const existingData = await getAppleNewsData(entryId, locale, ctx, fieldName);

    let articleData;
    if (existingData?.id) {
      // Always refresh revision before update to avoid 409 conflicts
      let revision = existingData.revision;
      try {
        const fresh = await readArticle(existingData.id, credentials);
        revision = fresh.revision;
      } catch {
        // use stored revision if read fails
      }
      articleData = await updateArticle(existingData.id, revision, articleJson, credentials);
    } else {
      articleData = await createArticle(articleJson, credentials);
    }

    const data: AppleNewsData = {
      id: articleData.id,
      revision: articleData.revision,
      publishedAt: articleData.publishedAt ?? new Date().toISOString(),
      shareUrl: articleData.shareUrl,
    };
    await writeAppleNewsData(entryId, locale, data, ctx, fieldName);

    return { success: true, shareUrl: data.shareUrl } as PublishActionResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message } as PublishActionResult;
  }
};
