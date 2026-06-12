import { describe, it, expect } from 'vitest';
import { resolveStory } from '../fetch';
import type { EntrySource, SourcedEntry, SourcedAsset } from '../entrySource';
import type { AppInstallationParameters } from '../../types';

/**
 * Builds a mock EntrySource backed by in-memory entry and asset maps.
 *
 * `getEntryWithIncludes` returns the root entry plus all entries/assets in the maps,
 * mirroring how a real `references` call bundles everything at once. This means tests
 * can set up linked entries (people, photos, shows) in the same map and they'll
 * resolve without extra API calls — matching the production behaviour.
 */
function makeSource(
  entries: Record<string, SourcedEntry>,
  assets: Record<string, SourcedAsset> = {},
): EntrySource {
  const assetsById = new Map(Object.entries(assets));
  return {
    async getEntry(id) {
      return entries[id] ?? null;
    },
    async getEntryWithIncludes(id) {
      const entry = entries[id] ?? null;
      const entriesById = new Map(Object.entries(entries));
      return { entry, entriesById, assetsById };
    },
    async getAsset(id) {
      return assets[id] ?? null;
    },
  };
}

const baseParams: AppInstallationParameters = {
  locale: 'en-US',
  canonicalUrlTemplate: 'https://www.example.org/stories/{slug}',
};

describe('resolveStory', () => {
  it('extracts title and description', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'My Story', shortDescription: 'A great story' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.title).toBe('My Story');
    expect(story.description).toBe('A great story');
  });

  it('returns null description when field is absent', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'Title' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.description).toBeNull();
  });

  it('resolves a linked lead photo via the Contentful Images API', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          primaryImage: { sys: { id: 'photo1', linkType: 'Entry' } },
        },
      },
      photo1: {
        id: 'photo1',
        contentType: 'photo',
        fields: {
          asset: { sys: { id: 'photo-asset-1' }, fields: { file: { url: 'https://img.example.com/photo.jpg', details: { image: { width: 4000, height: 3000 } } } } },
          altText: 'Alt text',
        },
      },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.leadImage?.url).toContain('w=2048');
    expect(story.leadImage?.url).toContain('fm=jpg');
    expect(story.leadImage?.url).toContain('q=80');
    expect(story.leadImage?.url).not.toContain('fit=');
    expect(story.leadImage?.url).not.toContain('fl=');
    expect(story.leadImage?.width).toBe(2048);
    expect(story.leadImage?.height).toBe(1536);
    expect(story.leadImage?.altText).toBe('Alt text');
  });

  it('resolves a lead photo whose asset comes via assetsById (CMA references bundle)', async () => {
    const source = makeSource(
      {
        entry1: {
          id: 'entry1',
          contentType: 'story',
          fields: { title: 'Title', primaryImage: { sys: { id: 'photo1', linkType: 'Entry' } } },
        },
        photo1: {
          id: 'photo1',
          contentType: 'photo',
          fields: {
            asset: { sys: { id: 'asset-1', linkType: 'Asset' } },
            altText: 'Alt via bundle',
          },
        },
      },
      {
        'asset-1': { id: 'asset-1', url: 'https://img.example.com/bundled.jpg', width: 4000, height: 3000 },
      },
    );
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.leadImage?.url).toContain('w=2048');
    expect(story.leadImage?.width).toBe(2048);
    expect(story.leadImage?.height).toBe(1536);
    expect(story.leadImage?.altText).toBe('Alt via bundle');
  });

  it('does not upscale images narrower than the target width', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          primaryImage: { sys: { id: 'photo1', linkType: 'Entry' } },
        },
      },
      photo1: {
        id: 'photo1',
        contentType: 'photo',
        fields: {
          asset: { fields: { file: { url: 'https://img.example.com/small.jpg', details: { image: { width: 600, height: 400 } } } } },
        },
      },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.leadImage?.width).toBe(600);
    expect(story.leadImage?.height).toBe(400);
  });

  it('resolves linked people (hosts, reporters) from the bundle', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          hosts: [{ sys: { id: 'person-1' } }],
          reporters: [{ sys: { id: 'person-2' } }],
        },
      },
      'person-1': { id: 'person-1', contentType: 'person', fields: { name: 'Alice', slug: 'alice' } },
      'person-2': { id: 'person-2', contentType: 'person', fields: { name: 'Bob', slug: 'bob' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.people.hosts).toEqual([{ id: 'person-1', name: 'Alice', title: null, slug: 'alice' }]);
    expect(story.people.reporters).toEqual([{ id: 'person-2', name: 'Bob', title: null, slug: 'bob' }]);
  });

  it('resolves show title and category title from the bundle', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          shows: [{ sys: { id: 'show-1' } }],
          categories: [{ sys: { id: 'cat-1' } }],
        },
      },
      'show-1': { id: 'show-1', contentType: 'show', fields: { title: 'Morning Edition' } },
      'cat-1': { id: 'cat-1', contentType: 'category', fields: { title: 'News' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.showTitle).toBe('Morning Edition');
    expect(story.categoryTitle).toBe('News');
  });

  it('collects all category entry IDs into categoryIds', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          categories: [{ sys: { id: 'cat-1' } }, { sys: { id: 'cat-2' } }],
        },
      },
      'cat-1': { id: 'cat-1', contentType: 'category', fields: { title: 'News' } },
      'cat-2': { id: 'cat-2', contentType: 'category', fields: { title: 'Culture' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.categoryIds).toEqual(['cat-1', 'cat-2']);
  });

  it('returns empty categoryIds when no categories are linked', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'Title' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.categoryIds).toEqual([]);
  });

  it('resolves corrections field', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'T', corrections: 'A correction was made.' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.corrections).toBe('A correction was made.');
  });

  it('returns empty embedMap and linkMap when body is null', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'T' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.embedMap.size).toBe(0);
    expect(story.linkMap.size).toBe(0);
    expect(story.body).toBeNull();
  });

  it('returns empty warnings on a clean resolve', async () => {
    const source = makeSource({
      entry1: { id: 'entry1', contentType: 'story', fields: { title: 'T' } },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.warnings).toEqual([]);
  });

  it('surfaces a warning when the lead image entry is not found', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          primaryImage: { sys: { id: 'missing-photo', linkType: 'Entry' } },
        },
      },
      // missing-photo intentionally absent from the bundle
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.leadImage).toBeNull();
    expect(story.warnings).toHaveLength(1);
    expect(story.warnings[0]).toMatch(/Lead image \(entry missing-photo\) not found/);
  });

  it('surfaces a warning when a linked person is not found in the bundle', async () => {
    const source = makeSource({
      entry1: {
        id: 'entry1',
        contentType: 'story',
        fields: {
          title: 'Title',
          hosts: [{ sys: { id: 'missing-person' } }],
        },
      },
    });
    const story = await resolveStory('entry1', baseParams, source);
    expect(story.people.hosts).toEqual([]);
    expect(story.warnings[0]).toMatch(/host entry missing-person not found/);
  });
});
