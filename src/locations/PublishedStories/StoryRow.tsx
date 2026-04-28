import { Table, Badge, Flex, TextLink } from '@contentful/f36-components';
import type { PublishedStorySummary, AppleNewsState } from '../../types';
import { APPLE_NEWS_STATE_LABELS } from '../../types';

interface StoryRowProps {
  story: PublishedStorySummary;
  onOpenEntry: (entryId: string) => void;
}

type BadgeVariant = 'primary' | 'positive' | 'negative' | 'warning' | 'secondary' | 'featured';

const STATE_VARIANTS: Record<AppleNewsState, BadgeVariant> = {
  LIVE: 'positive',
  PROCESSING: 'warning',
  PROCESSING_UPDATE: 'warning',
  FAILED_PROCESSING: 'negative',
  FAILED_PROCESSING_UPDATE: 'negative',
  TAKEN_DOWN: 'secondary',
  DUPLICATE: 'secondary',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateFormatter.format(d);
};

export const StoryRow: React.FC<StoryRowProps> = ({ story, onOpenEntry }) => {
  const stateLabel = story.state ? APPLE_NEWS_STATE_LABELS[story.state] : 'Unknown';
  const stateVariant: BadgeVariant = story.state ? STATE_VARIANTS[story.state] : 'secondary';

  return (
    <Table.Row>
      <Table.Cell>
        <Flex gap="spacingXs" alignItems="center" flexWrap="wrap">
          <TextLink as="button" onClick={() => onOpenEntry(story.entryId)}>
            {story.title || '(Untitled)'}
          </TextLink>
          {story.isPreview && <Badge variant="warning">Preview</Badge>}
          {story.needsUpdate && <Badge variant="primary">Needs update</Badge>}
          {story.hasDraft && <Badge variant="secondary">Has draft</Badge>}
        </Flex>
      </Table.Cell>
      <Table.Cell>
        <Badge variant={stateVariant}>{stateLabel}</Badge>
      </Table.Cell>
      <Table.Cell>{formatDate(story.bylineDate)}</Table.Cell>
      <Table.Cell>{formatDate(story.updatedAt)}</Table.Cell>
      <Table.Cell>
        {story.shareUrl ? (
          <TextLink href={story.shareUrl} target="_blank" rel="noopener noreferrer">
            Open in Apple News
          </TextLink>
        ) : (
          '—'
        )}
      </Table.Cell>
    </Table.Row>
  );
};
