import { useState, useEffect, useRef, useCallback } from 'react';
import type { SidebarAppSDK, EditorAppSDK } from '@contentful/app-sdk';
import type {
  PublishActionResult,
  CheckStatusResult,
  DeleteActionResult,
  AppleNewsData,
  AppleNewsState,
  AppInstallationParameters,
} from '../types';
import { PENDING_APPLE_NEWS_STATES } from '../types';
import { FIELD_NAMES } from '../lib/conventions';

export type PublishState =
  | { status: 'idle' }
  | { status: 'loading'; isPreview: boolean }
  | { status: 'success'; shareUrl: string; isPreview: boolean; warnings?: string[] }
  | { status: 'error'; error: string; isPreview: boolean };

export type DeleteState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; error: string };

export type AppleNewsStatus =
  | { status: 'checking' }
  | { status: 'published'; data: AppleNewsData; polling?: boolean; pollError?: string; pollWarnings?: string[] }
  | { status: 'unpublished' }
  | { status: 'unknown' };

type EntrySDK = SidebarAppSDK | EditorAppSDK;

// Exponential backoff for polling Apple News processing state.
// Starts at 3s (Apple often finishes in well under a minute), doubles, caps at 60s.
// Overall budget ~10 min after which we stop polling even if still PROCESSING.
const POLL_DELAY_INITIAL_MS = 3_000;
const POLL_DELAY_MAX_MS = 60_000;
const POLL_TOTAL_BUDGET_MS = 10 * 60_000;

function isPending(state: AppleNewsState | undefined): boolean {
  return !!state && PENDING_APPLE_NEWS_STATES.includes(state);
}

function readStoredAppleNewsData(sdk: EntrySDK): AppleNewsData | null {
  const params = sdk.parameters.installation as AppInstallationParameters;
  const locale = params.locale ?? 'en-US';
  try {
    const raw = sdk.entry.fields[FIELD_NAMES.appleNewsData]?.getValue(locale);
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as AppleNewsData;
  } catch {
    return null;
  }
}

function initialAppleNewsStatus(sdk: EntrySDK): AppleNewsStatus {
  const data = readStoredAppleNewsData(sdk);
  if (data?.id) {
    return { status: 'published', data, polling: isPending(data.state) };
  }
  return { status: 'unpublished' };
}

export function useAppleNews(sdk: EntrySDK) {
  const cma = sdk.cma;
  const params = sdk.parameters.installation as AppInstallationParameters;
  const locale = params.locale ?? 'en-US';
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' });
  const [appleNewsStatus, setAppleNewsStatus] = useState<AppleNewsStatus>(() => initialAppleNewsStatus(sdk));
  const [entrySys, setEntrySys] = useState(() => sdk.entry.getSys());
  const [canPublish, setCanPublish] = useState(false);

  // Guard against stale async work writing to state after unmount or SDK change.
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCancelledRef = useRef(false);

  // Sequence counter so out-of-order CMA fetches don't clobber newer results.
  const fetchSeqRef = useRef(0);

  const stopPolling = useCallback(() => {
    pollCancelledRef.current = true;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const applyEntryState = useCallback((sys: ReturnType<typeof sdk.entry.getSys>, data: AppleNewsData | null) => {
    setEntrySys(sys);
    if (!data?.id) {
      stopPolling();
      setAppleNewsStatus(prev => (prev.status === 'unpublished' ? prev : { status: 'unpublished' }));
    } else {
      setAppleNewsStatus(prev => {
        if (prev.status === 'published' && prev.data.id === data.id) {
          return { ...prev, data };
        }
        return { status: 'published', data };
      });
    }
  }, [stopPolling]);

  // Fetches the entry directly from CMA — the authoritative source across iframes.
  // onSysChanged fires in every location (sidebar + editor) when the entry is
  // written on the server by an App Action, so fetching here picks up server-side
  // writes that the SDK's in-iframe field/sys caches miss. Out-of-order fetches
  // are discarded via fetchSeqRef.
  const syncFromCma = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const entry = await cma.entry.get({
        spaceId: sdk.ids.space,
        environmentId: sdk.ids.environment,
        entryId: sdk.ids.entry,
      });
      if (seq !== fetchSeqRef.current) return;
      const raw = (entry.fields as Record<string, Record<string, unknown>>)[FIELD_NAMES.appleNewsData]?.[locale];
      let data: AppleNewsData | null = null;
      if (raw) {
        try {
          data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as AppleNewsData;
        } catch {
          data = null;
        }
      }
      const sys = entry.sys as ReturnType<typeof sdk.entry.getSys>;
      applyEntryState(sys, data);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      // Fall back to local SDK caches if CMA fetch fails.
      applyEntryState(sdk.entry.getSys(), readStoredAppleNewsData(sdk));
    }
  }, [cma, sdk, locale, applyEntryState]);

  useEffect(() => {
    // Fire an immediate sync and subscribe to all subsequent sys changes.
    // onSysChanged fires for both in-iframe field writes and server-side CMA writes
    // from App Actions (since the server write triggers a publish, which bumps sys).
    void syncFromCma();
    return sdk.entry.onSysChanged(() => { void syncFromCma(); });
  }, [sdk.entry, syncFromCma]);

  useEffect(() => {
    sdk.access.can('publish', 'Entry').then(setCanPublish).catch(() => setCanPublish(false));
  }, [sdk.access]);

  const callAction = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      // Encode action + any extra options as a JSON string in the `action` parameter
      // so we don't need additional declared parameters in the App Action schema.
      const actionValue = extra && Object.keys(extra).length > 0
        ? JSON.stringify({ name: action, ...extra })
        : action;
      const result = await cma.appActionCall.createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { action: actionValue, entryId: sdk.ids.entry } },
      );
      return result.response.body as string;
    },
    [cma, sdk.ids],
  );

  /**
   * Polls the refreshStatus action with exponential backoff until the Apple News state
   * is no longer `PROCESSING` / `PROCESSING_UPDATE`, or the overall budget expires.
   * Safe to call repeatedly — cancels any prior poll first.
   */
  const startPolling = useCallback(() => {
    stopPolling();
    pollCancelledRef.current = false;
    const startedAt = Date.now();
    let delay = POLL_DELAY_INITIAL_MS;

    const tick = async () => {
      if (pollCancelledRef.current) return;
      try {
        const raw = await callAction('refreshStatus');
        if (pollCancelledRef.current) return;
        const body = JSON.parse(raw) as CheckStatusResult;
        if (body.error) {
          // Surface the error but keep whatever published state we already had.
          setAppleNewsStatus(prev =>
            prev.status === 'published'
              ? { ...prev, polling: false, pollError: body.error }
              : prev,
          );
          return;
        }
        if (body.published && body.data) {
          const done = !isPending(body.state);
          setAppleNewsStatus({
            status: 'published',
            data: body.data,
            polling: !done,
            pollWarnings: body.warnings,
          });
          if (done) return;
        } else if (!body.published) {
          setAppleNewsStatus({ status: 'unpublished' });
          return;
        }
      } catch (err) {
        if (pollCancelledRef.current) return;
        setAppleNewsStatus(prev =>
          prev.status === 'published'
            ? { ...prev, polling: false, pollError: err instanceof Error ? err.message : String(err) }
            : prev,
        );
        return;
      }

      if (Date.now() - startedAt >= POLL_TOTAL_BUDGET_MS) {
        setAppleNewsStatus(prev =>
          prev.status === 'published' ? { ...prev, polling: false } : prev,
        );
        return;
      }
      delay = Math.min(delay * 2, POLL_DELAY_MAX_MS);
      pollTimeoutRef.current = setTimeout(tick, delay);
    };

    pollTimeoutRef.current = setTimeout(tick, POLL_DELAY_INITIAL_MS);
  }, [callAction, stopPolling]);

  // On mount, if the locally-read state is pending, kick off polling immediately.
  // The local field read already sets the initial status synchronously — no network call needed.
  useEffect(() => {
    if (appleNewsStatus.status === 'published' && appleNewsStatus.polling) {
      startPolling();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  const isPublishedInContentful = entrySys.publishedVersion != null;
  const isBusy = publishState.status === 'loading' || deleteState.status === 'loading';

  // True when the entry has draft changes that haven't been published in Contentful yet.
  // Mirrors the server-side check: version === publishedVersion + 1 means no pending changes.
  const hasPendingChanges =
    entrySys.publishedVersion != null &&
    entrySys.version > entrySys.publishedVersion + 1;

  // True when actual content has been published in Contentful after the last Apple News send.
  // contentfulVersion stores the entry's publishedVersion at send time (v1). Our own
  // appleNewsData write + re-publish adds +2, so allow up to v1+2 before flagging.
  const needsUpdate =
    appleNewsStatus.status === 'published' &&
    appleNewsStatus.data.contentfulVersion != null &&
    entrySys.publishedVersion != null &&
    entrySys.publishedVersion > appleNewsStatus.data.contentfulVersion + 2;

  const doPublish = async (isPreview: boolean, extra?: { isCandidateToBeFeatured?: boolean; isSponsored?: boolean }) => {
    setDeleteState({ status: 'idle' });
    setPublishState({ status: 'loading', isPreview });
    stopPolling();
    // Preserve metadata flags from the previously stored AppleNewsData when the
    // caller doesn't specify them. This lets the sidebar (which has no metadata
    // UI) re-publish without unsetting flags that were set earlier via the editor.
    // When neither caller nor stored provides a value, omit the flag so the
    // server falls back to entry-derived defaults from resolveArticleMetadata.
    const stored = appleNewsStatus.status === 'published' ? appleNewsStatus.data : undefined;
    const mergedExtra: { isCandidateToBeFeatured?: boolean; isSponsored?: boolean } = {};
    if (extra?.isCandidateToBeFeatured !== undefined) {
      mergedExtra.isCandidateToBeFeatured = extra.isCandidateToBeFeatured;
    } else if (stored?.isCandidateToBeFeatured !== undefined) {
      mergedExtra.isCandidateToBeFeatured = stored.isCandidateToBeFeatured;
    }
    if (extra?.isSponsored !== undefined) {
      mergedExtra.isSponsored = extra.isSponsored;
    } else if (stored?.isSponsored !== undefined) {
      mergedExtra.isSponsored = stored.isSponsored;
    }
    try {
      const raw = await callAction('publish', { ...(isPreview ? { isPreview: true } : undefined), ...mergedExtra });
      const body = JSON.parse(raw) as PublishActionResult;
      if (body.success && body.shareUrl) {
        setPublishState({ status: 'success', shareUrl: body.shareUrl, isPreview, warnings: body.warnings });
        const data = body.data ?? { id: '', revision: '', publishedAt: '', shareUrl: body.shareUrl };
        const pending = isPending(data.state);
        setAppleNewsStatus({ status: 'published', data, polling: pending });
        // If Apple didn't return a state (older deployment) or state is pending,
        // start polling to surface the eventual LIVE / FAILED_PROCESSING transition.
        if (!data.state || pending) startPolling();
      } else {
        setPublishState({ status: 'error', error: body.error ?? 'Unknown error publishing to Apple News', isPreview });
      }
    } catch (err: unknown) {
      setPublishState({ status: 'error', error: err instanceof Error ? err.message : String(err), isPreview });
    }
  };

  const handlePublish = (extra?: { isCandidateToBeFeatured?: boolean; isSponsored?: boolean }) => doPublish(false, extra);
  const handlePublishPreview = (extra?: { isCandidateToBeFeatured?: boolean; isSponsored?: boolean }) => doPublish(true, extra);

  const handleDelete = async () => {
    setPublishState({ status: 'idle' });
    setDeleteState({ status: 'loading' });
    stopPolling();
    try {
      const raw = await callAction('delete');
      const body = JSON.parse(raw) as DeleteActionResult;
      if (body.success) {
        setDeleteState({ status: 'success' });
        setAppleNewsStatus({ status: 'unpublished' });
      } else {
        setDeleteState({ status: 'error', error: body.error ?? 'Unknown error removing from Apple News' });
      }
    } catch (err: unknown) {
      setDeleteState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const requestDelete = () => setDeleteState({ status: 'confirming' });
  const cancelDelete = () => setDeleteState({ status: 'idle' });

  return {
    publishState,
    deleteState,
    appleNewsStatus,
    isPublishedInContentful,
    isBusy,
    hasPendingChanges,
    needsUpdate,
    canPublish,
    handlePublish,
    handlePublishPreview,
    handleDelete,
    requestDelete,
    cancelDelete,
  };
}
