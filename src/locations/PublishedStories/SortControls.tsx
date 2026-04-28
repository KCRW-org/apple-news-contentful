import { Flex, Button, Text } from '@contentful/f36-components';
import type { SortOption } from '../../types';

interface SortControlsProps {
  sort: SortOption;
  onChange: (next: SortOption) => void;
}

const LABELS: Record<SortOption, string> = {
  publishDate: 'Publish date',
  updatedAt: 'Last updated',
};

export const SortControls: React.FC<SortControlsProps> = ({ sort, onChange }) => {
  return (
    <Flex alignItems="center" gap="spacingS">
      <Text fontWeight="fontWeightMedium">Sort:</Text>
      <Flex gap="spacingXs">
        {(['publishDate', 'updatedAt'] as SortOption[]).map(s => (
          <Button
            key={s}
            size="small"
            variant={sort === s ? 'primary' : 'secondary'}
            onClick={() => onChange(s)}
          >
            {LABELS[s]}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
};
