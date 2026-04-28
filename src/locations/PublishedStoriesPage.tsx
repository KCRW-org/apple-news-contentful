import { useEffect, useRef, useState } from 'react';
import {
  Heading,
  Flex,
  Spinner,
  Note,
  Button,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { PageAppSDK } from '@contentful/app-sdk';
import type { EntryProps } from 'contentful-management';
import type {
  AppInstallationParameters,
  AppleNewsData,
  PublishStatusFilter,
  PublishedStorySummary,
  SortOption,
} from '../types';
import { fieldNames, contentTypeIds } from '../lib/site';
import {
  isOutOfDateWithAppleNews,
  hasUnpublishedChanges,
} from '../lib/publishedStoriesState';
import { FilterControls } from './PublishedStories/FilterControls';
import { SortControls } from './PublishedStories/SortControls';
import { StoriesTable } from './PublishedStories/StoriesTable';
import { LoadMore } from './PublishedStories/LoadMore';

const BATCH_SIZE = 25;

const entryToSummary = (
  entry: EntryProps,
  locale: string,
): PublishedStorySummary => {
  const fields = entry.fields as Record<string, Record<string, unknown>>;
  const appleNewsData = fields[fieldNames.appleNewsData]?.[locale] as
    | AppleNewsData
    | undefined;
  const title = (fields[fieldNames.title]?.[locale] as string | undefined) ?? '';
  const bylineDate = fields[fieldNames.bylineDate]?.[locale] as string | undefined;

  return {
    entryId: entry.sys.id,
    appleNewsId: appleNewsData?.id ?? '',
    title,
    bylineDate,
    updatedAt: entry.sys.updatedAt,
    shareUrl: appleNewsData?.shareUrl,
    state: appleNewsData?.state,
    isPreview: !!appleNewsData?.isPreview,
    needsUpdate: isOutOfDateWithAppleNews(entry.sys, appleNewsData?.contentfulVersion),
    hasDraft: hasUnpublishedChanges(entry.sys),
  };
};

const PublishedStoriesPage = () => {
  const sdk = useSDK<PageAppSDK>();
  const cma = sdk.cma;
  const appParams = sdk.parameters.installation as AppInstallationParameters;
  const isConfigured = !!(appParams.apiKeyId && appParams.apiKeySecret && appParams.channelId);
  const [canPublish, setCanPublish] = useState<boolean | undefined>();
  const [stories, setStories] = useState<PublishedStorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(isConfigured);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<PublishStatusFilter>('all');
  const [sort, setSort] = useState<SortOption>('publishDate');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [skipRequest, setSkipRequest] = useState(0);
  const requestTokenRef = useRef(0);

  const handleFilterChange = (next: PublishStatusFilter) => {
    if (next === filter) return;
    setFilter(next);
  };

  const handleSortChange = (next: SortOption) => {
    if (next === sort) return;
    setSort(next);
    setSkipRequest(0);
  };

  const handleRefresh = () => {
    setSkipRequest(0);
    setRefreshNonce(prev => prev + 1);
  };

  const handleLoadMore = () => {
    setSkipRequest(stories.length);
  };

  useEffect(() => {
    let cancelled = false;
    sdk.access
      .can('publish', 'Entry')
      .then(allowed => {
        if (!cancelled) setCanPublish(allowed);
      })
      .catch(() => {
        if (!cancelled) setCanPublish(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sdk.access]);

  useEffect(() => {
    if (!isConfigured || !canPublish) return;
    const token = ++requestTokenRef.current;
    const fetchStories = async () => {
      setLoading(true);
      try {
        const locale = appParams.locale ?? 'en-US';
        const orderField =
          sort === 'updatedAt'
            ? 'sys.updatedAt'
            : `fields.${fieldNames.bylineDate}`;

        const result = await cma.entry.getMany({
          query: {
            content_type: contentTypeIds.story,
            [`fields.${fieldNames.appleNewsData}[exists]`]: true,
            order: `-${orderField}`,
            limit: BATCH_SIZE,
            skip: skipRequest,
          },
        });

        if (token !== requestTokenRef.current) return;

        const entries = (result.items ?? []) as EntryProps[];
        const batch = entries.map(e => entryToSummary(e, locale));

        setStories(prev => (skipRequest === 0 ? batch : [...prev, ...batch]));
        setTotal(result.total ?? 0);
        setError(undefined);
        setHasFetchedOnce(true);
      } catch (err) {
        if (token !== requestTokenRef.current) return;
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Failed to load published stories';
        setError(errorMsg);
        if (skipRequest === 0) setStories([]);
      } finally {
        if (token === requestTokenRef.current) setLoading(false);
      }
    };

    fetchStories();
  }, [
    sort,
    skipRequest,
    isConfigured,
    canPublish,
    sdk.ids.space,
    sdk.ids.environment,
    refreshNonce,
  ]);

  if (canPublish === undefined) {
    return (
      <Flex flexDirection="column" margin="spacingL" gap="spacingM">
        <Heading>Apple News Stories</Heading>
        <Flex justifyContent="center" padding="spacingL">
          <Spinner />
        </Flex>
      </Flex>
    );
  }

  if (!canPublish) {
    return (
      <Flex flexDirection="column" margin="spacingL" gap="spacingM">
        <Heading>Apple News Stories</Heading>
        <Note variant="warning" title="Access denied">
          You need publish permissions to view stories published to Apple News.
        </Note>
      </Flex>
    );
  }

  if (!isConfigured) {
    return (
      <Flex flexDirection="column" margin="spacingL" gap="spacingM">
        <Heading>Apple News Stories</Heading>
        <Note variant="warning" title="App not configured">
          Set the Apple News API Key ID, API Key Secret, and Channel ID in the app configuration to view published stories.
        </Note>
      </Flex>
    );
  }

  const showFullSpinner = loading && !hasFetchedOnce;
  const showInlineSpinner = loading && hasFetchedOnce;
  const visibleStories = stories.filter(s => {
    if (filter === 'published') return !s.isPreview;
    if (filter === 'preview') return s.isPreview;
    return true;
  });
  const hasMore = stories.length < total;

  return (
    <Flex flexDirection="column" margin="spacingL" gap="spacingM">
      <Flex alignItems="center" gap="spacingS">
        <Heading marginBottom="none">Apple News Stories</Heading>
        {showInlineSpinner && <Spinner size="small" />}
        <Button
          size="small"
          variant="secondary"
          onClick={handleRefresh}
          isDisabled={loading}
        >
          Refresh
        </Button>
      </Flex>
      <Flex
        gap="spacingXl"
        flexWrap="wrap"
        justifyContent="space-between"
        alignItems="center"
      >
        <FilterControls filter={filter} onChange={handleFilterChange} />
        <SortControls sort={sort} onChange={handleSortChange} />
      </Flex>
      {showFullSpinner ? (
        <Flex justifyContent="center" padding="spacingL">
          <Spinner />
        </Flex>
      ) : visibleStories.length === 0 ? (
        error ? (
          <Note variant="negative" title="Error">
            {error}
          </Note>
        ) : (
          <Note variant="neutral" title="No stories">
            {filter === 'all'
              ? 'No stories have been published to Apple News yet. Open a story entry and use the Apple News sidebar to publish your first one.'
              : hasMore
                ? 'No loaded stories match this filter yet. Click "Load more" to keep looking, or switch to "All".'
                : filter === 'preview'
                  ? 'No stories are currently in preview. Switch to "All" to see other published stories.'
                  : 'No published (non-preview) stories. Switch to "All" to see all stories.'}
          </Note>
        )
      ) : (
        <>
          {error && (
            <Note variant="negative" title="Error">
              {error}
            </Note>
          )}
          <StoriesTable
            stories={visibleStories}
            onOpenEntry={entryId =>
              sdk.navigator.openEntry(entryId, { slideIn: true })
            }
          />
        </>
      )}
      {hasFetchedOnce && total > 0 && (
        <LoadMore
          loaded={stories.length}
          total={total}
          hasMore={hasMore}
          isLoading={loading}
          onLoadMore={handleLoadMore}
        />
      )}
    </Flex>
  );
};

export default PublishedStoriesPage;
