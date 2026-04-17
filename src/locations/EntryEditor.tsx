import { useState, useEffect } from 'react';
import { EditorAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Checkbox,
  Flex,
  Heading,
  Note,
  Spinner,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Text,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { APPLE_NEWS_STATE_LABELS } from '../types';
import { useAppleNews } from './useAppleNews';
import { downloadPreview } from './downloadPreview';
import type { AppInstallationParameters } from '../types';
import type { ArticleMetadataExtra } from './AppleNewsControls';

type DownloadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; warnings: string[]; bundledCount: number }
  | { status: 'error'; error: string };

const SectionCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <Flex
    flexDirection="column"
    gap="spacingS"
    style={{
      minWidth: 0,
      background: '#f7f9fa',
      borderRadius: 8,
      padding: '16px',
      border: '1px solid #e5e9ed',
      ...style,
    }}
  >
    {children}
  </Flex>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    fontWeight="fontWeightDemiBold"
    fontColor="gray600"
    style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}
  >
    {children}
  </Text>
);

const EntryEditor = () => {
  const sdk = useSDK<EditorAppSDK>();
  const params = sdk.parameters.installation as AppInstallationParameters;
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: 'idle' });

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
    handlePublishPreview,
    handleDelete,
    requestDelete,
    cancelDelete,
  } = useAppleNews(sdk);

  // Initialize checkboxes from the stored Apple News metadata so they reflect what was
  // last sent. Changes to these checkboxes enable re-publishing even without content edits.
  const storedData = appleNewsStatus.status === 'published' ? appleNewsStatus.data : undefined;
  const [isCandidateToBeFeatured, setIsCandidateToBeFeatured] = useState(
    () => storedData?.isCandidateToBeFeatured ?? false,
  );
  const [isSponsored, setIsSponsored] = useState(
    () => storedData?.isSponsored ?? false,
  );

  useEffect(() => {
    setIsCandidateToBeFeatured(!!storedData?.isCandidateToBeFeatured);
    setIsSponsored(!!storedData?.isSponsored);
  }, [storedData?.isCandidateToBeFeatured, storedData?.isSponsored]);

  // Always send explicit booleans so the server can distinguish "user unchecked this"
  // from "caller didn't specify" — the sidebar (no checkboxes) omits these entirely
  // and the hook falls back to stored values.
  const metadataExtra: ArticleMetadataExtra = {
    isCandidateToBeFeatured,
    isSponsored,
  };

  // True when the checkbox values differ from what was last sent to Apple News.
  const hasMetadataChanges = isPublishedInContentful && storedData != null && (
    !!isCandidateToBeFeatured !== !!storedData.isCandidateToBeFeatured ||
    !!isSponsored !== !!storedData.isSponsored
  );

  const handleDownloadPreview = async () => {
    setDownloadState({ status: 'loading' });
    try {
      const { warnings, bundledCount } = await downloadPreview({
        entryId: sdk.ids.entry,
        params,
        spaceId: sdk.ids.space,
        environmentId: sdk.ids.environment,
      });
      setDownloadState({ status: 'success', warnings, bundledCount });
    } catch (err) {
      setDownloadState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const isPublished = appleNewsStatus.status === 'published';
  const isPreviewArticle = isPublished && appleNewsStatus.data.isPreview;
  const isLiveArticle = isPublished && !isPreviewArticle;
  const actionsDisabled = isBusy || !isPublishedInContentful || hasPendingChanges || appleNewsStatus.status === 'checking';
  // Disable "Publish Article" / "Update Article" when the live article already reflects
  // the current Contentful content and metadata checkboxes haven't changed.
  const publishDisabled = actionsDisabled || (isLiveArticle && !needsUpdate && !hasMetadataChanges);
  // Disable "Create Preview" / "Update Preview" when the article is already current,
  // or when a live (non-preview) article exists (preview would downgrade it).
  const previewDisabled = actionsDisabled || (isPublished && !needsUpdate && !hasMetadataChanges) || isLiveArticle;

  const publishButtonLabel =
    appleNewsStatus.status === 'checking' ? (
      <Flex alignItems="center" gap="spacingXs">
        <Spinner size="small" />
        <Text>Checking…</Text>
      </Flex>
    ) : isPublished && !isPreviewArticle ? (
      'Update Article'
    ) : (
      'Publish Article'
    );

  const previewButtonLabel = isPublished ? 'Update Preview' : 'Create Preview';

  // Consolidated feedback: any non-idle result from the last action.
  const hasFeedback =
    publishState.status === 'success' ||
    publishState.status === 'error' ||
    deleteState.status === 'success' ||
    deleteState.status === 'error' ||
    downloadState.status === 'success' ||
    downloadState.status === 'error' ||
    (isPublished && publishState.status === 'idle' &&
      (appleNewsStatus.polling ||
        (appleNewsStatus.data.state && appleNewsStatus.data.state !== 'LIVE') ||
        !!appleNewsStatus.pollError));

  return (
    <Flex flexDirection="column" gap="spacingL" padding="spacingL">
      <Heading marginBottom="none">Apple News Publisher</Heading>

      {/* Warnings — persistent preconditions and article status notices */}
      {(!isPublishedInContentful || hasPendingChanges || isPreviewArticle || needsUpdate) && (
        <Flex flexDirection="column" gap="spacingS">
          {!isPublishedInContentful && (
            <Note variant="warning">
              Entry must be published in Contentful before sending to Apple News.
            </Note>
          )}
          {isPublishedInContentful && hasPendingChanges && (
            <Note variant="warning">
              Entry has unpublished changes. Publish all changes in Contentful before sending to Apple News.
            </Note>
          )}
          {isPreviewArticle && (
            <Note variant="warning">
              Preview — visible to Apple News admins only. Publish the article to make it public.
            </Note>
          )}
          {needsUpdate && (
            <Note variant="warning">
              This entry has been updated in Contentful since it was last sent to Apple News. Re-send to keep the article current.
            </Note>
          )}
        </Flex>
      )}

      {/* Feedback area — top of page so it's always visible */}
      {hasFeedback && (
        <Flex flexDirection="column" gap="spacingS">
          {/* Publish / preview action result */}
          {publishState.status === 'success' && (
            <Note variant="positive" title={publishState.isPreview ? 'Preview ready' : 'Published to Apple News'}>
              <Text fontSize="fontSizeS">
                <a href={publishState.shareUrl} target="_blank" rel="noreferrer">
                  {publishState.isPreview ? 'View preview ↗' : 'View article ↗'}
                </a>
              </Text>
              {publishState.warnings && publishState.warnings.length > 0 && (
                <ul style={{ margin: '6px 0 0 16px' }}>
                  {publishState.warnings.map((w, i) => (
                    <li key={i}><Text fontSize="fontSizeS">{w}</Text></li>
                  ))}
                </ul>
              )}
            </Note>
          )}
          {publishState.status === 'error' && (
            <Note variant="negative" title={publishState.isPreview ? 'Preview failed' : 'Publish failed'}>
              <Text fontSize="fontSizeS">{publishState.error}</Text>
            </Note>
          )}

          {/* Delete result */}
          {deleteState.status === 'success' && (
            <Note variant="positive" title="Removed from Apple News">
              <Text fontSize="fontSizeS">The story has been removed from Apple News.</Text>
            </Note>
          )}
          {deleteState.status === 'error' && (
            <Note variant="negative" title="Remove failed">
              <Text fontSize="fontSizeS">{deleteState.error}</Text>
            </Note>
          )}

          {/* Download result */}
          {downloadState.status === 'success' && (
            <Note variant="positive" title="Preview downloaded">
              <Text fontSize="fontSizeS">
                {downloadState.bundledCount === 0
                  ? 'Open the .news.zip with the Apple News Preview app.'
                  : `Bundled ${downloadState.bundledCount} image${downloadState.bundledCount === 1 ? '' : 's'}. Open the .news.zip with Apple News Preview.`}
              </Text>
              {downloadState.warnings.length > 0 && (
                <ul style={{ margin: '6px 0 0 16px' }}>
                  {downloadState.warnings.map((w, i) => (
                    <li key={i}><Text fontSize="fontSizeS">{w}</Text></li>
                  ))}
                </ul>
              )}
            </Note>
          )}
          {downloadState.status === 'error' && (
            <Note variant="negative" title="Download failed">
              <Text fontSize="fontSizeS">{downloadState.error}</Text>
            </Note>
          )}

          {/* Apple News processing state */}
          {isPublished && publishState.status === 'idle' &&
            (appleNewsStatus.polling || (appleNewsStatus.data.state && appleNewsStatus.data.state !== 'LIVE') || appleNewsStatus.pollError) && (
            <Note variant={
              appleNewsStatus.data.state === 'FAILED_PROCESSING' || appleNewsStatus.data.state === 'FAILED_PROCESSING_UPDATE'
                ? 'negative' : 'neutral'
            }>
              {appleNewsStatus.polling ? (
                <Flex alignItems="center" gap="spacingXs">
                  <Spinner size="small" />
                  <Text fontSize="fontSizeS">{APPLE_NEWS_STATE_LABELS[appleNewsStatus.data.state!] ?? 'Processing'}…</Text>
                </Flex>
              ) : (
                <Text fontSize="fontSizeS"><strong>{appleNewsStatus.data.state ? APPLE_NEWS_STATE_LABELS[appleNewsStatus.data.state] : 'Unknown'}</strong></Text>
              )}
              {appleNewsStatus.pollError && (
                <Text fontColor="red600" fontSize="fontSizeS" style={{ marginTop: 4 }}>
                  Could not refresh: {appleNewsStatus.pollError}
                </Text>
              )}
            </Note>
          )}
        </Flex>
      )}

      {/* Side-by-side Publish / Preview */}
      <Flex gap="spacingM" alignItems="flex-start">

        {/* Publish card — 2/3 width */}
        <SectionCard style={{ flex: 2 }}>
          <SectionLabel>Publish</SectionLabel>

          {canPublish ? (
            <>
              <Flex flexDirection="row" gap="spacingM">
                <Checkbox
                  isChecked={isCandidateToBeFeatured}
                  onChange={() => setIsCandidateToBeFeatured(v => !v)}
                >
                  Candidate to be featured
                </Checkbox>
                <Checkbox
                  isChecked={isSponsored}
                  onChange={() => setIsSponsored(v => !v)}
                >
                  Sponsored content
                </Checkbox>
              </Flex>

              <Button
                variant="positive"
                onClick={() => handlePublish(metadataExtra)}
                isDisabled={publishDisabled}
                isFullWidth
              >
                {publishState.status === 'loading' && !publishState.isPreview ? (
                  <Flex alignItems="center" gap="spacingXs">
                    <Spinner size="small" />
                    <Text>{isPublished ? 'Updating…' : 'Publishing…'}</Text>
                  </Flex>
                ) : publishButtonLabel}
              </Button>
            </>
          ) : (
            <Text fontColor="gray500" fontSize="fontSizeS">
              You need publish permission to publish to Apple News.
            </Text>
          )}

          {/* Delete */}
          {isPublished && (
            deleteState.status === 'confirming' ? (
              <Flex flexDirection="column" gap="spacingXs">
                <Text fontColor="gray600" fontSize="fontSizeS">Remove this story from Apple News?</Text>
                <Flex gap="spacingXs" style={{ flexWrap: 'nowrap' }}>
                  <Button variant="negative" size="small" onClick={handleDelete} style={{ flex: 1 }}>Remove</Button>
                  <Button variant="secondary" size="small" onClick={cancelDelete} style={{ flex: 1 }}>Cancel</Button>
                </Flex>
              </Flex>
            ) : (
              <Button
                variant="secondary"
                size="small"
                onClick={requestDelete}
                isDisabled={isBusy || deleteState.status === 'success'}
                isFullWidth
              >
                {deleteState.status === 'loading' ? (
                  <Flex alignItems="center" gap="spacingXs">
                    <Spinner size="small" />
                    <Text>Removing…</Text>
                  </Flex>
                ) : 'Remove from Apple News'}
              </Button>
            )
          )}
        </SectionCard>

        {/* Preview card — 1/3 width */}
        <SectionCard style={{ flex: 1 }}>
          <SectionLabel>Preview</SectionLabel>

          <Button
            variant="secondary"
            onClick={() => handlePublishPreview(metadataExtra)}
            isDisabled={previewDisabled}
            isFullWidth
          >
            {publishState.status === 'loading' && publishState.isPreview ? (
              <Flex alignItems="center" gap="spacingXs">
                <Spinner size="small" />
                <Text>{isPublished ? 'Updating…' : 'Creating…'}</Text>
              </Flex>
            ) : previewButtonLabel}
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownloadPreview}
            isDisabled={downloadState.status === 'loading'}
            isFullWidth
          >
            {downloadState.status === 'loading' ? (
              <Flex alignItems="center" gap="spacingXs">
                <Spinner size="small" />
                <Text>Building…</Text>
              </Flex>
            ) : 'Download Preview'}
          </Button>

          <Text fontColor="gray500" fontSize="fontSizeS">
            Apple previews are visible to channel admins only. Download builds a .news.zip for the Apple News Preview app.
          </Text>
        </SectionCard>
      </Flex>

      {/* Article details — below actions */}
      {isPublished && (
        <Table>
          <TableBody>
            <TableRow>
              <TableCell><Text fontWeight="fontWeightDemiBold">{isPreviewArticle ? 'Preview URL' : 'Share URL'}</Text></TableCell>
              <TableCell>
                <a href={appleNewsStatus.data.shareUrl} target="_blank" rel="noreferrer">
                  {appleNewsStatus.data.shareUrl}
                </a>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell><Text fontWeight="fontWeightDemiBold">Article ID</Text></TableCell>
              <TableCell><Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{appleNewsStatus.data.id}</Text></TableCell>
            </TableRow>
            {appleNewsStatus.data.publishedAt && (
              <TableRow>
                <TableCell><Text fontWeight="fontWeightDemiBold">{isPreviewArticle ? 'Created At' : 'Published At'}</Text></TableCell>
                <TableCell><Text>{new Date(appleNewsStatus.data.publishedAt).toLocaleString()}</Text></TableCell>
              </TableRow>
            )}
            {appleNewsStatus.data.contentfulVersion != null && (
              <TableRow>
                <TableCell><Text fontWeight="fontWeightDemiBold">Contentful Version at Last Send</Text></TableCell>
                <TableCell><Text>{appleNewsStatus.data.contentfulVersion}</Text></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Flex>
  );
};

export default EntryEditor;
