import { describe, it, expect } from 'vitest';
import { buildArticle, mergeDeep } from '../article';
import type { ResolvedStory, AppInstallationParameters } from '../../types';

const minimalStory: ResolvedStory = {
  title: 'Test Story',
  description: 'A test description',
  byline: 'by Jane Doe ｜ Monday, January 1, 2024',
  leadImage: null,
  audio: null,
  video: null,
  body: null,
  corrections: null,
  embedMap: new Map(),
  linkMap: new Map(),
};

const baseParams: AppInstallationParameters = {
  apiKeyId: 'k',
  apiKeySecret: 's',
  channelId: 'c',
  locale: 'en-US',
};

describe('buildArticle', () => {
  it('returns a valid ANF document with required fields', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    expect(doc.version).toBe('1.7');
    expect(doc.title).toBe('Test Story');
    expect(doc.identifier).toBe('entry1');
    expect(doc.language).toBe('en-US');
    expect(Array.isArray(doc.components)).toBe(true);
  });

  it('includes title, intro (description), and byline components', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    // title, intro, and byline are nested inside a header container
    const headerContainer = doc.components.find(c => c.role === 'container' && c.layout === 'headerLayout');
    expect(headerContainer).toBeDefined();
    const children = (headerContainer as any).components as Array<Record<string, unknown>>;
    const childRoles = children.map((c: any) => c.role);
    expect(childRoles).toContain('title');
    expect(childRoles).toContain('intro');
    expect(childRoles).toContain('body'); // byline as body
  });

  it('does not include a lead photo when leadImage is null', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    expect(doc.components.find(c => c.role === 'photo')).toBeUndefined();
  });

  it('includes a lead photo when leadImage is set', () => {
    const story = { ...minimalStory, leadImage: { url: 'https://img.example.com/photo.jpg', width: 800, height: 600 } };
    const doc = buildArticle('entry1', story, baseParams);
    expect(doc.components.find(c => c.role === 'photo')).toBeDefined();
  });

  it('includes a corrections section after body when corrections is set', () => {
    const story = { ...minimalStory, corrections: 'An earlier version of this story was incorrect.' };
    const doc = buildArticle('entry1', story, baseParams);
    const corrIdx = doc.components.findIndex(c => (c as any).identifier === 'corrections');
    expect(corrIdx).toBeGreaterThan(-1);
  });

  it('includes a footer when footerText is set', () => {
    const params = { ...baseParams, footerText: 'KCRW Member Supported' };
    const doc = buildArticle('entry1', minimalStory, params);
    const footer = doc.components.find(c => c.layout === 'footerLayout');
    expect(footer).toBeDefined();
  });

  it('applies articleCustomizationsJson via deep merge', () => {
    const params = {
      ...baseParams,
      articleCustomizationsJson: JSON.stringify({
        metadata: { generatorName: 'Custom Generator' },
      }),
    };
    const doc = buildArticle('entry1', minimalStory, params);
    expect((doc.metadata as any).generatorName).toBe('Custom Generator');
  });

  it('ignores invalid articleCustomizationsJson without throwing', () => {
    const params = { ...baseParams, articleCustomizationsJson: 'not json' };
    expect(() => buildArticle('entry1', minimalStory, params)).not.toThrow();
  });
});

describe('mergeDeep', () => {
  it('recursively merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10 }, e: 5 };
    const result = mergeDeep(target, source);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3, e: 5 });
  });

  it('source arrays replace target arrays', () => {
    const result = mergeDeep({ arr: [1, 2] }, { arr: [3] });
    expect((result as any).arr).toEqual([3]);
  });
});
