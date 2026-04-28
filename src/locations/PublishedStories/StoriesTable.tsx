import { Table } from '@contentful/f36-components';
import type { PublishedStorySummary } from '../../types';
import { StoryRow } from './StoryRow';

interface StoriesTableProps {
  stories: PublishedStorySummary[];
  onOpenEntry: (entryId: string) => void;
}

export const StoriesTable: React.FC<StoriesTableProps> = ({ stories, onOpenEntry }) => {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Cell as="th">Title</Table.Cell>
          <Table.Cell as="th">State</Table.Cell>
          <Table.Cell as="th">Publish date</Table.Cell>
          <Table.Cell as="th">Last updated</Table.Cell>
          <Table.Cell as="th">Share URL</Table.Cell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {stories.map(story => (
          <StoryRow key={story.entryId} story={story} onOpenEntry={onOpenEntry} />
        ))}
      </Table.Body>
    </Table>
  );
};
