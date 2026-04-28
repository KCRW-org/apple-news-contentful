import type { EntryMetaSysProps } from 'contentful-management';

export const isOutOfDateWithAppleNews = (
  sys: Pick<EntryMetaSysProps, 'publishedVersion'>,
  contentfulVersion: number | undefined,
): boolean => {
  if (sys.publishedVersion === undefined) return false;
  if (contentfulVersion === undefined) return true;
  return sys.publishedVersion > contentfulVersion + 2;
};

export const hasUnpublishedChanges = (
  sys: Pick<EntryMetaSysProps, 'version' | 'publishedVersion'>,
): boolean => {
  if (sys.publishedVersion === undefined) return false;
  return sys.version > sys.publishedVersion + 1;
};
