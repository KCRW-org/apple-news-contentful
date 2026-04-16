import type { PlainClientAPI } from 'contentful-management';
import type { FunctionEventHandler, FunctionTypeEnum } from '@contentful/node-apps-toolkit';
import type { AppInstallationParameters, AppleNewsData } from '../src/types';
import type { ApiCredentials } from '../src/lib/api';
import { deleteArticle } from '../src/lib/api';
import { FIELD_NAMES } from '../src/lib/conventions';

type AppEventHandler = FunctionEventHandler<FunctionTypeEnum.AppEventHandler, AppInstallationParameters>;

/**
 * Handles Contentful entry lifecycle events that affect Apple News state:
 *
 * - **unpublish / archive** — The entry is no longer public. Delete the corresponding
 *   Apple News article and clear the `appleNewsData` field so the sidebar reflects
 *   the disconnected state on next load.
 */
export const appEventHandler: AppEventHandler = async (event, context) => {
  const topic = (event.headers?.['X-Contentful-Topic'] ?? '') as string;
  const match = topic.match(/^ContentManagement\.Entry\.(unpublish|archive)$/);
  if (!match) return; // Not an entry event we care about.

  const action = match[1] as 'unpublish' | 'archive';
  const entryId = (event.body as { sys?: { id?: string } })?.sys?.id;
  if (!entryId) {
    console.warn('[appEvents] Entry event missing sys.id; ignoring.');
    return;
  }

  const params = context.appInstallationParameters as AppInstallationParameters;
  const { apiKeyId, apiKeySecret, channelId } = params;
  if (!apiKeyId || !apiKeySecret || !channelId) {
    console.warn('[appEvents] Apple News credentials not configured; ignoring entry event.');
    return;
  }
  const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
  const locale = params.locale ?? 'en-US';
  const fieldName = FIELD_NAMES.appleNewsData;

  const { spaceId, environmentId, cma } = context;
  if (!cma) {
    console.warn('[appEvents] CMA client not available; ignoring entry event.');
    return;
  }

  // Read the stored Apple News data to find the article ID.
  let appleNewsData: AppleNewsData | null = null;
  try {
    const entry = await cma.entry.get({ spaceId, environmentId, entryId });
    const raw = (entry.fields as Record<string, Record<string, unknown>>)[fieldName]?.[locale];
    if (raw) {
      appleNewsData = (typeof raw === 'string' ? JSON.parse(raw) : raw) as AppleNewsData;
    }
  } catch (err) {
    console.warn(`[appEvents] Could not read appleNewsData for entry ${entryId}:`, err);
    return;
  }

  if (!appleNewsData?.id) {
    // Entry was never published to Apple News — nothing to do.
    return;
  }

  // Delete the article from Apple News.
  try {
    await deleteArticle(appleNewsData.id, credentials);
  } catch (err) {
    // deleteArticle already tolerates 404 (article already gone). Any other error
    // is unexpected but we can only log it — event handlers don't return errors.
    console.error(
      `[appEvents] Failed to delete Apple News article ${appleNewsData.id} for entry ${entryId} (${action}):`,
      err,
    );
    return;
  }

  // Clear the appleNewsData field so the sidebar shows the entry as disconnected.
  try {
    const entry = await cma.entry.get({ spaceId, environmentId, entryId });
    const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    if (fields[fieldName]) {
      delete fields[fieldName][locale];
      await cma.entry.update({ spaceId, environmentId, entryId }, entry);
    }
  } catch (err) {
    console.error(
      `[appEvents] Deleted Apple News article ${appleNewsData.id} but failed to clear appleNewsData on entry ${entryId}:`,
      err,
    );
  }
};
