import React, { useState, useEffect } from 'react';
import { SidebarAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Flex,
  Note,
  Spinner,
  Text,
} from '@contentful/f36-components';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';
import type { PublishActionResult, CheckStatusResult, DeleteActionResult } from '../types';

type PublishState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; shareUrl: string }
  | { status: 'error'; error: string };

type DeleteState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; error: string };

type AppleNewsStatus = 'checking' | 'published' | 'unpublished' | 'unknown';

const EntrySidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  const cma = sdk.cma;
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' });
  const [appleNewsStatus, setAppleNewsStatus] = useState<AppleNewsStatus>('checking');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [entrySys, setEntrySys] = useState(() => sdk.entry.getSys());

  useAutoResizer();

  useEffect(() => {
    return sdk.entry.onSysChanged(setEntrySys);
  }, [sdk.entry]);

  // Check current Apple News status on mount
  useEffect(() => {
    cma.appActionCall
      .createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { action: 'checkStatus', entryId: sdk.ids.entry } },
      )
      .then(result => {
        const body = JSON.parse(result.response.body) as CheckStatusResult;
        setAppleNewsStatus(body.published ? 'published' : 'unpublished');
        if (body.shareUrl) setShareUrl(body.shareUrl);
      })
      .catch(() => setAppleNewsStatus('unknown'));
  }, [sdk.ids, cma]);

  const isPublishedInContentful = entrySys.publishedVersion != null;
  const isBusy = publishState.status === 'loading' || deleteState.status === 'loading';

  const publishButtonLabel =
    appleNewsStatus === 'checking' ? (
      <Flex alignItems="center" gap="spacingXs">
        <Spinner size="small" />
        <Text>Checking Apple News status…</Text>
      </Flex>
    ) : appleNewsStatus === 'published' ? (
      'Update in Apple News'
    ) : (
      'Publish to Apple News'
    );

  const handlePublish = async () => {
    setDeleteState({ status: 'idle' });
    setPublishState({ status: 'loading' });
    try {
      const result = await cma.appActionCall.createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { entryId: sdk.ids.entry } },
      );
      const body = JSON.parse(result.response.body) as PublishActionResult;
      if (body.success && body.shareUrl) {
        setPublishState({ status: 'success', shareUrl: body.shareUrl });
        setShareUrl(body.shareUrl);
        setAppleNewsStatus('published');
      } else {
        setPublishState({ status: 'error', error: body.error ?? 'Unknown error publishing to Apple News' });
      }
    } catch (err: unknown) {
      setPublishState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDelete = async () => {
    setPublishState({ status: 'idle' });
    setDeleteState({ status: 'loading' });
    try {
      const result = await cma.appActionCall.createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { action: 'delete', entryId: sdk.ids.entry } },
      );
      const body = JSON.parse(result.response.body) as DeleteActionResult;
      if (body.success) {
        setDeleteState({ status: 'success' });
        setShareUrl(null);
        setAppleNewsStatus('unpublished');
      } else {
        setDeleteState({ status: 'error', error: body.error ?? 'Unknown error removing from Apple News' });
      }
    } catch (err: unknown) {
      setDeleteState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Flex flexDirection="column" gap="spacingS" style={{ wordBreak: 'break-word' }}>
      {!isPublishedInContentful && (
        <Note variant="warning">
          Entry must be published in Contentful before sending to Apple News.
        </Note>
      )}

      <Button
        variant="primary"
        onClick={handlePublish}
        isDisabled={isBusy || !isPublishedInContentful || appleNewsStatus === 'checking'}
        isFullWidth
      >
        {publishState.status === 'loading' ? (
          <Flex alignItems="center" gap="spacingXs">
            <Spinner size="small" />
            <Text>{appleNewsStatus === 'published' ? 'Updating…' : 'Publishing…'}</Text>
          </Flex>
        ) : (
          publishButtonLabel
        )}
      </Button>

      {publishState.status === 'success' && (
        <Note variant="positive" title="Published to Apple News">
          <Text>
            <a href={publishState.shareUrl} target="_blank" rel="noreferrer">
              View in Apple News
            </a>
          </Text>
        </Note>
      )}

      {publishState.status === 'error' && (
        <Note variant="negative" title="Publish failed">
          <Text>{publishState.error}</Text>
        </Note>
      )}

      {appleNewsStatus === 'published' && shareUrl && publishState.status === 'idle' && (
        <Note variant="neutral">
          <Text>
            Published:{' '}
            <a href={shareUrl} target="_blank" rel="noreferrer">
              View in Apple News
            </a>
          </Text>
        </Note>
      )}

      {appleNewsStatus === 'published' && deleteState.status === 'confirming' ? (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray700" fontSize="fontSizeS">
            Remove this story from Apple News?
          </Text>
          <Flex gap="spacingXs">
            <Button variant="negative" size="small" onClick={handleDelete} isFullWidth>
              Delete
            </Button>
            <Button variant="secondary" size="small" onClick={() => setDeleteState({ status: 'idle' })} isFullWidth>
              Cancel
            </Button>
          </Flex>
        </Flex>
      ) : appleNewsStatus === 'published' ? (
        <Button
          variant="negative"
          onClick={() => setDeleteState({ status: 'confirming' })}
          isDisabled={isBusy || deleteState.status === 'success'}
          isFullWidth
        >
          {deleteState.status === 'loading' ? (
            <Flex alignItems="center" gap="spacingXs">
              <Spinner size="small" />
              <Text>Removing…</Text>
            </Flex>
          ) : (
            'Remove from Apple News'
          )}
        </Button>
      ) : null}

      {deleteState.status === 'success' && (
        <Note variant="positive" title="Removed from Apple News">
          <Text>The story has been removed from Apple News.</Text>
        </Note>
      )}

      {deleteState.status === 'error' && (
        <Note variant="negative" title="Remove failed">
          <Text>{deleteState.error}</Text>
        </Note>
      )}
    </Flex>
  );
};

export default EntrySidebar;
