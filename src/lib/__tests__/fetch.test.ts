import { describe, it, expect, vi } from 'vitest';
import { resolveStory } from '../fetch';
import type { AppInstallationParameters } from '../../types';

const makeCma = (entryFields: Record<string, unknown>) => ({
  entry: {
    get: vi.fn().mockResolvedValue({
      fields: Object.fromEntries(
        Object.entries(entryFields).map(([k, v]) => [k, { 'en-US': v }])
      ),
    }),
  },
});

const baseParams: AppInstallationParameters = {
  locale: 'en-US',
  canonicalUrlTemplate: 'https://www.example.org/stories/{slug}',
};

describe('resolveStory', () => {
  it('extracts title and description', async () => {
    const cma = makeCma({
      title: 'My Story',
      shortDescription: 'A great story',
    }) as any;
    const story = await resolveStory('entry1', baseParams, {
      cma,
      spaceId: 'space1',
      environmentId: 'master',
    });
    expect(story.title).toBe('My Story');
    expect(story.description).toBe('A great story');
  });

  it('returns null description when field is absent', async () => {
    const cma = makeCma({ title: 'Title' }) as any;
    const story = await resolveStory('entry1', baseParams, {
      cma,
      spaceId: 's',
      environmentId: 'e',
    });
    expect(story.description).toBeNull();
  });

  it('fetches linked photo entry to resolve leadImage', async () => {
    const cma = {
      entry: {
        get: vi.fn()
          .mockResolvedValueOnce({
            // story entry
            fields: {
              title: { 'en-US': 'Title' },
              primaryImage: { 'en-US': { sys: { id: 'photo1', linkType: 'Entry' } } },
            },
          })
          .mockResolvedValueOnce({
            // photo entry
            fields: {
              asset: { 'en-US': { url: 'https://img.example.com/photo.jpg', width: 800, height: 600 } },
              altText: { 'en-US': 'Alt text' },
            },
          }),
      },
    } as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.leadImage).toEqual({
      url: 'https://img.example.com/photo.jpg',
      width: 800,
      height: 600,
      altText: 'Alt text',
      caption: undefined,
      credit: undefined,
    });
  });

  it('resolves corrections field', async () => {
    const cma = makeCma({ title: 'T', corrections: 'A correction was made.' }) as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.corrections).toBe('A correction was made.');
  });

  it('returns empty embedMap and linkMap when body is null', async () => {
    const cma = makeCma({ title: 'T' }) as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.embedMap.size).toBe(0);
    expect(story.linkMap.size).toBe(0);
    expect(story.body).toBeNull();
  });
});
