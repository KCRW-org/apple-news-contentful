import { Flex, Button, Text } from '@contentful/f36-components';

interface LoadMoreProps {
  loaded: number;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

export const LoadMore: React.FC<LoadMoreProps> = ({
  loaded,
  total,
  hasMore,
  isLoading,
  onLoadMore,
}) => {
  return (
    <Flex gap="spacingM" justifyContent="center" alignItems="center">
      <Text>
        Loaded {loaded} of {total}
      </Text>
      {hasMore && (
        <Button onClick={onLoadMore} isDisabled={isLoading} variant="secondary">
          Load more
        </Button>
      )}
    </Flex>
  );
};
