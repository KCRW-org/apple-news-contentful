import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Flex, Note, Spinner, Text } from '@contentful/f36-components';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';
import { APPLE_NEWS_STATE_LABELS } from '../types';
import { useAppleNews } from './useAppleNews';

const EntrySidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const {
    publishState,
    deleteState,
    appleNewsStatus,
    isPublishedInContentful,
    isBusy,
    hasPendingChanges,
    needsUpdate,
    canPublish,
    handlePublish,
    handleDelete,
    requestDelete,
    cancelDelete,
  } = useAppleNews(sdk);

  const isPublished = appleNewsStatus.status === 'published';
  const isPreviewArticle = isPublished && appleNewsStatus.data.isPreview;
  const isLiveArticle = isPublished && !isPreviewArticle;
  const actionsDisabled = isBusy || !isPublishedInContentful || hasPendingChanges || appleNewsStatus.status === 'checking';
  const publishDisabled = actionsDisabled || (isLiveArticle && !needsUpdate);

  const publishButtonLabel =
    appleNewsStatus.status === 'checking' ? (
      <Flex alignItems="center" gap="spacingXs">
        <Spinner size="small" />
        <Text>Checking…</Text>
      </Flex>
    ) : isPublished && !isPreviewArticle ? (
      'Update Apple News Article'
    ) : (
      'Publish to Apple News'
    );

  return (
    <Flex flexDirection="column" gap="spacingS" style={{ wordBreak: 'break-word' }}>
      {/* Status */}
      {isPublished && publishState.status === 'idle' && (
        <Note variant={isPreviewArticle ? 'warning' : 'positive'} style={{ fontSize: '12px' }}>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontSize="fontSizeS" fontWeight="fontWeightDemiBold">
              {isPreviewArticle ? 'Apple Preview' : 'Live on Apple News'}
            </Text>
            {appleNewsStatus.data.state === 'FAILED_PROCESSING' || appleNewsStatus.data.state === 'FAILED_PROCESSING_UPDATE' ? (
              <Text fontSize="fontSizeS" fontColor="red600">{APPLE_NEWS_STATE_LABELS[appleNewsStatus.data.state]}</Text>
            ) : null}
            {needsUpdate && (
              <Text fontSize="fontSizeS" fontColor="gray600">
                Entry has been updated — consider re-sending to Apple News.
              </Text>
            )}
            <Text fontSize="fontSizeS">
              <a href={appleNewsStatus.data.shareUrl} target="_blank" rel="noreferrer">
                {isPreviewArticle ? 'Preview link ↗' : 'View article ↗'}
              </a>
            </Text>
          </Flex>
        </Note>
      )}

      {publishState.status === 'success' && (
        <Note variant="positive">
          <Text fontSize="fontSizeS">
            {publishState.isPreview ? 'Preview updated — ' : 'Published — '}
            <a href={publishState.shareUrl} target="_blank" rel="noreferrer">view ↗</a>
          </Text>
        </Note>
      )}

      {publishState.status === 'error' && (
        <Note variant="negative">
          <Text fontSize="fontSizeS">{publishState.error}</Text>
        </Note>
      )}

      {isPublishedInContentful && hasPendingChanges && (
        <Note variant="warning">
          <Text fontSize="fontSizeS">Unpublished changes — publish in Contentful before sending to Apple News.</Text>
        </Note>
      )}

      {/* Publish button */}
      {canPublish && (
        <Button
          variant="positive"
          onClick={() => handlePublish()}
          isDisabled={publishDisabled}
          isFullWidth
          size="small"
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

      {/* Delete */}
      {isPublished && deleteState.status === 'confirming' ? (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray700" fontSize="fontSizeS">Remove from Apple News?</Text>
          <Flex gap="spacingXs" style={{ flexWrap: 'nowrap' }}>
            <Button variant="negative" size="small" onClick={handleDelete} style={{ flex: 1 }}>Remove</Button>
            <Button variant="secondary" size="small" onClick={cancelDelete} style={{ flex: 1 }}>Cancel</Button>
          </Flex>
        </Flex>
      ) : isPublished ? (
        <Button
          variant="secondary"
          size="small"
          onClick={requestDelete}
          isDisabled={isBusy}
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

      {deleteState.status === 'error' && (
        <Note variant="negative">
          <Text fontSize="fontSizeS">{deleteState.error}</Text>
        </Note>
      )}
    </Flex>
  );
};

export default EntrySidebar;
