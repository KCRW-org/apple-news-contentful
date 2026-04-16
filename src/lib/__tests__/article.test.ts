import { describe, it, expect } from 'vitest';
import { buildArticle } from '../article';
import { mergeDeep, stripMarkdown } from '../utilities';
import type { ResolvedStory, AppInstallationParameters } from '../../types';

const minimalStory: ResolvedStory = {
  title: 'Test Story',
  description: 'A test description',
  showTitle: null,
  people: { hosts: [], reporters: [], producers: [], guests: [] },
  bylineDate: '2024-01-01',
  bylineCount: 1,
  categoryTitle: null,
  leadImage: null,
  thumbnailUrl: null,
  canonicalUrl: null,
  audio: null,
  video: null,
  body: null,
  corrections: null,
  embedMap: new Map(),
  linkMap: new Map(),
  warnings: [],
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

  it('includes title and byline in the header container', () => {
    const doc = buildArticle('entry1', { ...minimalStory, bylineDate: '2024-01-01', people: { hosts: [{ id: 'h1', name: 'Host One', title: null, slug: null }], reporters: [], producers: [], guests: [] } }, baseParams);
    const headerContainer = doc.components.find(c => c.role === 'container' && c.layout === 'headerLayout');
    expect(headerContainer).toBeDefined();
    const children = (headerContainer as any).components as Array<Record<string, unknown>>;
    const childRoles = children.map((c: any) => c.role);
    expect(childRoles).toContain('title');
    expect(childRoles).toContain('byline');
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

describe('stripMarkdown', () => {
  it('removes bold and italic markers', () => {
    expect(stripMarkdown('**bold** and _italic_')).toBe('bold and italic');
  });

  it('removes inline code', () => {
    expect(stripMarkdown('use `code` here')).toBe('use here');
  });

  it('replaces links with label text', () => {
    expect(stripMarkdown('[KCRW](https://www.kcrw.com)')).toBe('KCRW');
  });

  it('removes images', () => {
    expect(stripMarkdown('before ![alt](img.jpg) after')).toBe('before after');
  });

  it('removes heading markers', () => {
    expect(stripMarkdown('## Section Title')).toBe('Section Title');
  });

  it('removes blockquote markers', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
  });

  it('collapses extra whitespace', () => {
    expect(stripMarkdown('  lots   of   space  ')).toBe('lots of space');
  });

  it('returns plain text unchanged', () => {
    expect(stripMarkdown('Just plain text.')).toBe('Just plain text.');
  });
});
