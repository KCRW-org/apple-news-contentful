import { describe, it, expect } from 'vitest';
import { isOutOfDateWithAppleNews, hasUnpublishedChanges } from '../publishedStoriesState';

describe('publishedStoriesState', () => {
  describe('isOutOfDateWithAppleNews', () => {
    it('returns false when publishedVersion is undefined', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: undefined },
          5,
        ),
      ).toBe(false);
    });

    it('returns true when contentfulVersion is undefined', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 10 },
          undefined,
        ),
      ).toBe(true);
    });

    it('returns false when publishedVersion equals contentfulVersion', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 5 },
          5,
        ),
      ).toBe(false);
    });

    it('returns false when publishedVersion is within the +2 slack (equals contentfulVersion + 2)', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 7 },
          5,
        ),
      ).toBe(false);
    });

    it('returns false when publishedVersion is within the +2 slack (less than contentfulVersion + 2)', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 6 },
          5,
        ),
      ).toBe(false);
    });

    it('returns true when publishedVersion exceeds contentfulVersion + 2', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 8 },
          5,
        ),
      ).toBe(true);
    });

    it('returns false when publishedVersion is less than contentfulVersion', () => {
      expect(
        isOutOfDateWithAppleNews(
          { publishedVersion: 3 },
          5,
        ),
      ).toBe(false);
    });
  });

  describe('hasUnpublishedChanges', () => {
    it('returns false when publishedVersion is undefined', () => {
      expect(
        hasUnpublishedChanges({
          version: 5,
          publishedVersion: undefined,
        }),
      ).toBe(false);
    });

    it('returns true when version exceeds publishedVersion + 1', () => {
      expect(
        hasUnpublishedChanges({
          version: 8,
          publishedVersion: 5,
        }),
      ).toBe(true);
    });

    it('returns false when version equals publishedVersion + 1 (no unsaved changes, just the auto-bump)', () => {
      expect(
        hasUnpublishedChanges({
          version: 6,
          publishedVersion: 5,
        }),
      ).toBe(false);
    });
  });
});
