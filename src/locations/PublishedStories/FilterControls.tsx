import { Flex, Button, Text } from '@contentful/f36-components';
import type { PublishStatusFilter } from '../../types';

interface FilterControlsProps {
  filter: PublishStatusFilter;
  onChange: (next: PublishStatusFilter) => void;
}

const LABELS: Record<PublishStatusFilter, string> = {
  all: 'All',
  published: 'Published',
  preview: 'Preview only',
};

export const FilterControls: React.FC<FilterControlsProps> = ({ filter, onChange }) => {
  return (
    <Flex alignItems="center" gap="spacingS">
      <Text fontWeight="fontWeightMedium">Filter:</Text>
      <Flex gap="spacingXs">
        {(['all', 'published', 'preview'] as PublishStatusFilter[]).map(f => (
          <Button
            key={f}
            size="small"
            variant={filter === f ? 'primary' : 'secondary'}
            onClick={() => onChange(f)}
          >
            {LABELS[f]}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
};
