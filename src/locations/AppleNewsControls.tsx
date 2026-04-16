import React from 'react';
import {
  Button,
  Flex,
  Note,
  Spinner,
  Text,
} from '@contentful/f36-components';
import type { PublishState, DeleteState, AppleNewsStatus } from './useAppleNews';
import { APPLE_NEWS_STATE_LABELS } from '../types';

export type ArticleMetadataExtra = {
  isCandidateToBeFeatured?: boolean;
  isSponsored?: boolean;
};

type Props = {
  publishState: PublishState;
  deleteState: DeleteState;
  appleNewsStatus: AppleNewsStatus;
  isPublishedInContentful: boolean;
  isBusy: boolean;
  canPublish: boolean;
  onPublish: (extra?: ArticleMetadataExtra) => void;
  onPublishPreview: (extra?: ArticleMetadataExtra) => void;
  onDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  /** Extra metadata passed through to publish calls. */
  metadataExtra?: ArticleMetadataExtra;
};

const AppleNewsControls: React.FC<Props> = ({
  publishState,
  deleteState,
  appleNewsStatus,
  isPublishedInContentful,
  isBusy,
  canPublish,
  onPublish,
  onPublishPreview,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  metadataExtra,
}) => {
  const isPublished = appleNewsStatus.status === 'published';
  const isPreview = isPublished && appleNewsStatus.data.isPreview;
  const actionsDisabled = isBusy || !isPublishedInContentful || appleNewsStatus.status === 'checking';

  const publishButtonLabel =
    appleNewsStatus.status === 'checking' ? (
      <Flex alignItems="center" gap="spacingXs">
        <Spinner size="small" />
        <Text>Checking Apple News status…</Text>
      </Flex>
    ) : isPublished && !isPreview ? (
      'Update in Apple News'
    ) : (
      'Publish to Apple News'
    );

  const previewButtonLabel = isPublished ? 'Update Preview' : 'Create News Preview';

  return (
    <>
      {!isPublishedInContentful && (
        <Note variant="warning">
          Entry must be published in Contentful before sending to Apple News.
        </Note>
      )}

      {canPublish && (
        <Button
          variant="primary"
          onClick={() => onPublish(metadataExtra)}
          isDisabled={actionsDisabled}
          isFullWidth
        >
          {publishState.status === 'loading' && !publishState.isPreview ? (
            <Flex alignItems="center" gap="spacingXs">
              <Spinner size="small" />
              <Text>{isPublished ? 'Updating…' : 'Publishing…'}</Text>
            </Flex>
          ) : (
            publishButtonLabel
          )}
        </Button>
      )}

      <Button
        variant="secondary"
        onClick={() => onPublishPreview(metadataExtra)}
        isDisabled={actionsDisabled}
        isFullWidth
      >
        {publishState.status === 'loading' && publishState.isPreview ? (
          <Flex alignItems="center" gap="spacingXs">
            <Spinner size="small" />
            <Text>{isPublished ? 'Updating preview…' : 'Creating preview…'}</Text>
          </Flex>
        ) : (
          previewButtonLabel
        )}
      </Button>

      {publishState.status === 'success' && (
        <Note variant="positive" title={publishState.isPreview ? 'Preview created' : 'Published to Apple News'}>
          <Text>
            <a href={publishState.shareUrl} target="_blank" rel="noreferrer">
              {publishState.isPreview ? 'Preview link' : 'View in Apple News'}
            </a>
          </Text>
          {publishState.warnings && publishState.warnings.length > 0 && (
            <ul style={{ margin: '8px 0 0 16px' }}>
              {publishState.warnings.map((w, i) => (
                <li key={i}>
                  <Text fontSize="fontSizeS">{w}</Text>
                </li>
              ))}
            </ul>
          )}
        </Note>
      )}

      {publishState.status === 'error' && (
        <Note variant="negative" title="Publish failed">
          <Text>{publishState.error}</Text>
        </Note>
      )}

      {appleNewsStatus.status === 'published' && publishState.status === 'idle' && (
        <Note variant={
          appleNewsStatus.data.state === 'FAILED_PROCESSING' || appleNewsStatus.data.state === 'FAILED_PROCESSING_UPDATE'
            ? 'negative'
            : isPreview ? 'warning' : 'neutral'
        }>
          <Flex flexDirection="column" gap="spacingXs">
            {isPreview && (
              <Text fontWeight="fontWeightDemiBold">Preview — visible to Apple News admins only</Text>
            )}
            <Text>
              {appleNewsStatus.polling ? (
                <Flex alignItems="center" gap="spacingXs">
                  <Spinner size="small" />
                  <span>{APPLE_NEWS_STATE_LABELS[appleNewsStatus.data.state!] ?? 'Processing'}…</span>
                </Flex>
              ) : appleNewsStatus.data.state ? (
                <span><strong>{APPLE_NEWS_STATE_LABELS[appleNewsStatus.data.state]}</strong></span>
              ) : (
                <span>Published</span>
              )}
            </Text>
            <Text>
              <a href={appleNewsStatus.data.shareUrl} target="_blank" rel="noreferrer">
                {isPreview ? 'Preview link' : 'View in Apple News'}
              </a>
            </Text>
            {appleNewsStatus.pollError && (
              <Text fontColor="red600" fontSize="fontSizeS">
                Could not refresh status: {appleNewsStatus.pollError}
              </Text>
            )}
            {appleNewsStatus.pollWarnings && appleNewsStatus.pollWarnings.length > 0 && (
              <ul style={{ margin: '4px 0 0 16px' }}>
                {appleNewsStatus.pollWarnings.map((w, i) => (
                  <li key={i}>
                    <Text fontSize="fontSizeS">{w}</Text>
                  </li>
                ))}
              </ul>
            )}
          </Flex>
        </Note>
      )}

      {appleNewsStatus.status === 'published' && deleteState.status === 'confirming' ? (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray700" fontSize="fontSizeS">
            Remove this story from Apple News?
          </Text>
          <Flex gap="spacingXs">
            <Button variant="negative" size="small" onClick={onDelete} isFullWidth>
              Delete
            </Button>
            <Button variant="secondary" size="small" onClick={onCancelDelete} isFullWidth>
              Cancel
            </Button>
          </Flex>
        </Flex>
      ) : appleNewsStatus.status === 'published' ? (
        <Button
          variant="negative"
          onClick={onRequestDelete}
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
    </>
  );
};

export default AppleNewsControls;
