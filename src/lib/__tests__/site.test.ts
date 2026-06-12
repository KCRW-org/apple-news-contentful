// Tests for the SiteConfig implementation in site.ts.
// Adapted from conventions.test.ts and kcrw.test.ts — tests the public
// siteConfig interface rather than the internal helpers directly.

import { describe, it, expect } from 'vitest';
import { siteConfig, fieldNames } from '../site';
import type { ResolvedPeople, ResolvedPerson, ResolvedStory } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptyPeople = (): ResolvedPeople => ({ hosts: [], reporters: [], producers: [], guests: [] });
const person = (overrides: Partial<ResolvedPerson> & { name: string }): ResolvedPerson => ({
  id: overrides.id ?? `id-${overrides.name.replace(/\s+/g, '-').toLowerCase()}`,
  name: overrides.name,
  title: overrides.title ?? null,
  slug: overrides.slug ?? null,
});

const makeStory = (overrides: Partial<ResolvedStory> = {}): ResolvedStory => ({
  title: 'Story',
  description: null,
  showTitle: null,
  people: emptyPeople(),
  bylineDate: null,
  bylineCount: 1,
  categoryTitle: null,
  categoryIds: [],
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
  ...overrides,
});

// ── renderImageUrl ────────────────────────────────────────────────────────────

describe('renderImageUrl', () => {
  it('applies w, fm=jpg, and q for the lead role', () => {
    const url = new URL(siteConfig.renderImageUrl('https://images.ctfassets.net/x/y/photo.jpg', 'lead'));
    expect(url.searchParams.get('w')).toBe('2048');
    expect(url.searchParams.get('fm')).toBe('jpg');
    expect(url.searchParams.get('q')).toBe('80');
    expect(url.searchParams.get('fit')).toBeNull();
    expect(url.searchParams.get('fl')).toBeNull();
  });

  it('uses a smaller width for the body role', () => {
    const url = new URL(siteConfig.renderImageUrl('https://images.ctfassets.net/x/y/photo.jpg', 'body'));
    expect(url.searchParams.get('w')).toBe('1600');
  });

  it('preserves pre-existing query params on the source URL', () => {
    const url = new URL(siteConfig.renderImageUrl('https://images.ctfassets.net/x/y/photo.jpg?foo=bar', 'body'));
    expect(url.searchParams.get('foo')).toBe('bar');
    expect(url.searchParams.get('w')).toBe('1600');
  });

  it('normalizes protocol-relative URLs to https', () => {
    expect(siteConfig.renderImageUrl('//images.ctfassets.net/x/y/photo.jpg', 'thumb'))
      .toMatch(/^https:\/\//);
  });
});

// ── resolveImage ──────────────────────────────────────────────────────────────

describe('resolveImage', () => {
  it('returns null when no asset url is present', () => {
    expect(siteConfig.resolveImage({}, 'lead')).toBeNull();
    expect(siteConfig.resolveImage({ asset: {} }, 'lead')).toBeNull();
    expect(siteConfig.resolveImage({ asset: { fields: { file: {} } } }, 'lead')).toBeNull();
  });

  it('scales width/height proportionally to the lead target', () => {
    const image = siteConfig.resolveImage({
      asset: { fields: { file: { url: 'https://img.example.com/p.jpg', details: { image: { width: 4000, height: 3000 } } } } },
    }, 'lead');
    expect(image?.width).toBe(2048);
    expect(image?.height).toBe(1536); // 3000 * (2048/4000)
  });

  it('preserves original dimensions when source is narrower than the target', () => {
    const image = siteConfig.resolveImage({
      asset: { fields: { file: { url: 'https://img.example.com/p.jpg', details: { image: { width: 600, height: 400 } } } } },
    }, 'lead');
    expect(image?.width).toBe(600);
    expect(image?.height).toBe(400);
  });

  it('leaves dimensions undefined when source dimensions are missing', () => {
    const image = siteConfig.resolveImage({
      asset: { fields: { file: { url: 'https://img.example.com/p.jpg' } } },
    }, 'body');
    expect(image?.width).toBeUndefined();
    expect(image?.height).toBeUndefined();
  });

  it('passes through altText, caption, and credit', () => {
    const image = siteConfig.resolveImage({
      asset: { fields: { file: { url: 'https://img.example.com/p.jpg', details: { image: { width: 1000, height: 500 } } } } },
      altText: 'alt',
      photoCaption: 'cap',
      photoCredit: 'credit',
    }, 'body');
    expect(image?.altText).toBe('alt');
    expect(image?.caption).toBe('cap');
    expect(image?.credit).toBe('credit');
  });

  it('extracts asset ID from sys', () => {
    const image = siteConfig.resolveImage({
      asset: { sys: { id: 'asset-123' }, fields: { file: { url: 'https://img.example.com/p.jpg' } } },
    }, 'body');
    expect(image?.id).toBe('asset-123');
  });

  it('hydrates asset from assetsById when asset is an unresolved link', () => {
    const assetsById = new Map([
      ['asset-1', { id: 'asset-1', url: 'https://img.example.com/p.jpg', width: 2000, height: 1000 }],
    ]);
    const image = siteConfig.resolveImage(
      { asset: { sys: { linkType: 'Asset', id: 'asset-1' } } },
      'body',
      assetsById,
    );
    expect(image).not.toBeNull();
    expect(image?.id).toBe('asset-1');
    expect(image?.width).toBe(1600);
  });

  it('returns null when assetsById does not contain the linked asset', () => {
    const assetsById = new Map<string, { id: string; url: string; width: number | undefined; height: number | undefined }>();
    const image = siteConfig.resolveImage(
      { asset: { sys: { linkType: 'Asset', id: 'missing' } } },
      'body',
      assetsById,
    );
    expect(image).toBeNull();
  });
});

// ── formatByline — prefix selection ──────────────────────────────────────────

describe('formatByline — prefix selection', () => {
  it('uses "Hosted by" when hosts are present, regardless of reporters/producers', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex Jones' })];
    people.reporters = [person({ name: 'Jane Doe' })];
    people.producers = [person({ name: 'Sam' })];
    expect(siteConfig.formatByline(people, null, null, 1)).toBe('Hosted by Alex Jones');
  });

  it('uses "Reported by" when there are no hosts but reporters are present', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane Doe' })];
    people.producers = [person({ name: 'Sam' })];
    expect(siteConfig.formatByline(people, null, null, 1)).toBe('Reported by Jane Doe');
  });

  it('uses "By" when only producers are present', () => {
    const people = emptyPeople();
    people.producers = [person({ name: 'Sam Taylor' })];
    expect(siteConfig.formatByline(people, null, null, 1)).toBe('By Sam Taylor');
  });

  it('omits the names segment when only guests are present', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Historian Ham' })];
    expect(siteConfig.formatByline(people, '2024-01-01', null, 1)).toBe('Monday, January 1, 2024');
  });

  it('returns null when all collections are empty', () => {
    expect(siteConfig.formatByline(emptyPeople(), null, null, 1)).toBeNull();
  });
});

// ── formatByline — bylineCount ────────────────────────────────────────────────

describe('formatByline — bylineCount', () => {
  it('includes only the first contributor when bylineCount is 1 (default)', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alice' }), person({ name: 'Bob' }), person({ name: 'Carol' })];
    expect(siteConfig.formatByline(people, null, null, 1)).toBe('Hosted by Alice');
  });

  it('includes up to bylineCount contributors', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alice' }), person({ name: 'Bob' }), person({ name: 'Carol' })];
    expect(siteConfig.formatByline(people, null, null, 2)).toBe('Hosted by Alice and Bob');
    expect(siteConfig.formatByline(people, null, null, 3)).toBe('Hosted by Alice, Bob and Carol');
  });

  it('includes all contributors when bylineCount exceeds the list length', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alice' }), person({ name: 'Bob' })];
    expect(siteConfig.formatByline(people, null, null, 10)).toBe('Hosted by Alice and Bob');
  });
});

// ── formatByline — separators ─────────────────────────────────────────────────

describe('formatByline — separators', () => {
  it('joins name block, date, and category with bullet separators', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex' })];
    expect(siteConfig.formatByline(people, '2024-01-01', 'Politics', 1))
      .toBe('Hosted by Alex \u2022 Monday, January 1, 2024 \u2022 Politics');
  });

  it('drops the date when the ISO value is invalid (warns via console)', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex' })];
    expect(siteConfig.formatByline(people, 'not-a-date', 'Politics', 1))
      .toBe('Hosted by Alex \u2022 Politics');
  });

  it('returns null when every segment is empty', () => {
    expect(siteConfig.formatByline(emptyPeople(), null, null, 1)).toBeNull();
  });
});

// ── authorNames ──────────────────────────────────────────────────────────────

describe('authorNames', () => {
  it('returns host names when hosts are present', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alice' }), person({ name: 'Bob' })];
    expect(siteConfig.authorNames(people, 1)).toEqual(['Alice']);
    expect(siteConfig.authorNames(people, 2)).toEqual(['Alice', 'Bob']);
  });

  it('returns reporter names when no hosts', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane' })];
    expect(siteConfig.authorNames(people, 1)).toEqual(['Jane']);
  });

  it('returns empty array when only guests', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Guest' })];
    expect(siteConfig.authorNames(people, 1)).toEqual([]);
  });
});

// ── renderAfterBody — credits ─────────────────────────────────────────────────

describe('renderAfterBody — credits block', () => {
  const template = 'https://www.kcrw.com/path';
  const creditsContainer = (comps: ReturnType<typeof siteConfig.renderAfterBody>) =>
    comps.find(c => (c as any).identifier === 'credits') as any;
  const creditsChildren = (comps: ReturnType<typeof siteConfig.renderAfterBody>): any[] =>
    creditsContainer(comps)?.components ?? [];
  const allText = (comps: ReturnType<typeof siteConfig.renderAfterBody>) =>
    creditsChildren(comps).map((c: any) => c.text as string ?? '').join('');

  it('returns an empty array when no people are present and no corrections', () => {
    expect(siteConfig.renderAfterBody({ story: makeStory(), canonicalUrlTemplate: template })).toEqual([]);
  });

  it('wraps credits in a container with identifier "credits"', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const components = siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template });
    const container = creditsContainer(components);
    expect(container).toBeDefined();
    expect(container.role).toBe('container');
  });

  it('starts with a heading3 "Credits" component inside the container', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const children = creditsChildren(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(children[0].role).toBe('heading3');
    expect(children[0].text).toBe('Credits');
  });

  it('omits roles with no people', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const components = siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template });
    const text = allText(components);
    expect(text).toContain('Hosts');
    expect(text).not.toContain('Guests');
    expect(text).not.toContain('Producers');
  });

  it('renders each role as a heading4 followed by a body with ul', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Dr. Jane', title: 'Historian', slug: 'jane' })];
    const children = creditsChildren(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    const h4 = children.find((c: any) => c.role === 'heading4');
    expect(h4).toBeDefined();
    expect(h4.text).toBe('Guests');
    const body = children.find((c: any) => c.role === 'body' && c.text?.includes('<ul>'));
    expect(body).toBeDefined();
    expect(body.text).toContain('<li><a href="https://www.kcrw.com/people/jane">Dr. Jane</a> - Historian</li>');
  });

  it('renders guest titles with " - " separator when present', () => {
    const people = emptyPeople();
    people.guests = [
      person({ name: 'Dr. Jane', title: 'Historian', slug: 'jane' }),
      person({ name: 'Bob', title: null, slug: 'bob' }),
    ];
    const text = allText(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/jane">Dr. Jane</a> - Historian</li>');
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/bob">Bob</a></li>');
    expect(text).not.toMatch(/<a [^>]*>Bob<\/a> - /);
  });

  it('omits title from Host(s) / Producer(s) even when the person has one', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', title: 'Senior Host', slug: 'alex' })];
    people.producers = [person({ name: 'Sam', title: 'EP', slug: 'sam' })];
    const text = allText(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/alex">Alex</a></li>');
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/sam">Sam</a></li>');
    expect(text).not.toContain('Senior Host');
    expect(text).not.toContain('EP');
  });

  it('renders plain text when a person has no slug', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: null })];
    const text = allText(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(text).toContain('<li>Alex</li>');
    expect(text).not.toContain('<a ');
  });

  it('renders each person as a separate li', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' }), person({ name: 'Jordan', slug: 'jordan' })];
    const text = allText(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/alex">Alex</a></li>');
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/jordan">Jordan</a></li>');
  });

  it('escapes HTML-unsafe characters in names and titles', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Jane <script>', title: 'Role & More', slug: 'jane' })];
    const text = allText(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template }));
    expect(text).toContain('Jane &lt;script&gt;');
    expect(text).toContain('Role &amp; More');
  });

  it('returns empty array when only reporters are present (not listed in credits)', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane' })];
    expect(siteConfig.renderAfterBody({ story: makeStory({ people }), canonicalUrlTemplate: template })).toEqual([]);
  });
});

// ── renderAfterBody — corrections ─────────────────────────────────────────────

describe('renderAfterBody — corrections', () => {
  const template = 'https://www.kcrw.com/path';

  it('includes a corrections component when corrections is set', () => {
    const story = makeStory({ corrections: 'An earlier version was incorrect.' });
    const components = siteConfig.renderAfterBody({ story, canonicalUrlTemplate: template });
    const corrections = components.find(c => (c as any).identifier === 'corrections');
    expect(corrections).toBeDefined();
    expect((corrections as any).text).toContain('Correction:');
    expect((corrections as any).text).toContain('An earlier version was incorrect.');
  });

  it('places corrections before credits', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const story = makeStory({ people, corrections: 'Fix' });
    const components = siteConfig.renderAfterBody({ story, canonicalUrlTemplate: template });
    const ids = components.map(c => (c as any).identifier).filter(Boolean);
    expect(ids[0]).toBe('corrections');
    expect(ids[1]).toBe('credits');
  });
});

// ── resolveMediaLink ──────────────────────────────────────────────────────────

describe('resolveMediaLink', () => {
  it('returns a youtube embed when hosting is youtube', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://youtu.be/abc123', hosting: 'youtube' }))
      .toEqual({ type: 'youtube', url: 'https://youtu.be/abc123' });
  });

  it('returns a youtube embed when hosting is iframe and url contains youtube.com', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://www.youtube.com/embed/abc123', hosting: 'iframe' }))
      .toEqual({ type: 'youtube', url: 'https://www.youtube.com/embed/abc123' });
  });

  it('returns a youtube embed when hosting is iframe and url contains youtu.be', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://youtu.be/abc123', hosting: 'iframe' }))
      .toEqual({ type: 'youtube', url: 'https://youtu.be/abc123' });
  });

  it('returns null when hosting is iframe but url is not youtube', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://vimeo.com/abc123', hosting: 'iframe' })).toBeNull();
  });

  it('returns an audio embed when hosting is soundstack', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://cdn.soundstack.com/abc.mp3', hosting: 'soundstack' }))
      .toEqual({ type: 'audio', url: 'https://cdn.soundstack.com/abc.mp3' });
  });

  it('returns an audio embed when hosting is soundstack-podcast', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://cdn.soundstack.com/ep.mp3', hosting: 'soundstack-podcast' }))
      .toEqual({ type: 'audio', url: 'https://cdn.soundstack.com/ep.mp3' });
  });

  it('returns an audio embed when hosting is generic', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://example.com/audio.mp3', hosting: 'generic' }))
      .toEqual({ type: 'audio', url: 'https://example.com/audio.mp3' });
  });

  it('returns an audio embed when hosting is cloudfront', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://d1234.cloudfront.net/audio.mp3', hosting: 'cloudfront' }))
      .toEqual({ type: 'audio', url: 'https://d1234.cloudfront.net/audio.mp3' });
  });

  it('returns null when url is absent', () => {
    expect(siteConfig.resolveMediaLink({ hosting: 'youtube' })).toBeNull();
  });

  it('returns null when hosting is an unrecognised value', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://example.com/file.mp3', hosting: 'other' })).toBeNull();
  });

  it('returns null when hosting is absent', () => {
    expect(siteConfig.resolveMediaLink({ mediaUrl: 'https://example.com/file.mp3' })).toBeNull();
  });
});

// ── resolveParentSlug ─────────────────────────────────────────────────────────

describe('resolveParentSlug', () => {
  it('resolves the first show via entriesById for a Story', () => {
    const entriesById = new Map([
      ['show-1', { contentType: 'show', fields: { [fieldNames.slug]: 'morning-edition' } }],
      ['show-2', { contentType: 'show', fields: { [fieldNames.slug]: 'other-show' } }],
    ]);
    const fields = {
      [fieldNames.showsCollection]: [
        { sys: { id: 'show-1' } },
        { sys: { id: 'show-2' } },
      ],
    };
    expect(siteConfig.resolveParentSlug(fields, 'story', entriesById)).toEqual({ slug: 'morning-edition', contentType: 'show' });
  });

  it('returns undefined when showsCollection is empty', () => {
    expect(siteConfig.resolveParentSlug({ [fieldNames.showsCollection]: [] }, 'story')).toBeUndefined();
  });

  it('returns undefined when showsCollection field is absent', () => {
    expect(siteConfig.resolveParentSlug({}, 'story')).toBeUndefined();
  });

  it('returns undefined when the show is not in entriesById', () => {
    const fields = { [fieldNames.showsCollection]: [{ sys: { id: 'show-1' } }] };
    expect(siteConfig.resolveParentSlug(fields, 'story', new Map())).toBeUndefined();
  });

  it('returns undefined when the linked show has no slug', () => {
    const entriesById = new Map([['show-1', { contentType: 'show', fields: {} }]]);
    const fields = { [fieldNames.showsCollection]: [{ sys: { id: 'show-1' } }] };
    expect(siteConfig.resolveParentSlug(fields, 'story', entriesById)).toBeUndefined();
  });

  it('resolves parent for a LandingPage via seoMetadata → canonicalUrlParent', () => {
    const entriesById = new Map([
      ['seo-1', { contentType: 'seoMetadata', fields: { canonicalUrlParent: { sys: { id: 'parent-1' } } } }],
      ['parent-1', { contentType: 'landingPage', fields: { [fieldNames.slug]: 'music' } }],
    ]);
    const fields = { seoMetadata: { sys: { id: 'seo-1' } } };
    expect(siteConfig.resolveParentSlug(fields, 'landingPage', entriesById)).toEqual({ slug: 'music', contentType: 'landingPage' });
  });

  it('returns undefined for LandingPage when entriesById is absent', () => {
    expect(siteConfig.resolveParentSlug({ seoMetadata: { sys: { id: 'seo-1' } } }, 'landingPage')).toBeUndefined();
  });

  it('returns undefined for unknown content types', () => {
    expect(siteConfig.resolveParentSlug({}, 'Unknown')).toBeUndefined();
  });
});

// ── resolveEntryUrl ───────────────────────────────────────────────────────────

describe('resolveEntryUrl', () => {
  const base = 'https://www.kcrw.com';
  const template = `${base}/some/path`;

  it('resolves a Story with a parent show', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'story', slug: 'my-story', parentSlug: 'morning-edition', parentContentType: 'show' }, template))
      .toBe(`${base}/shows/morning-edition/stories/my-story`);
  });

  it('resolves a Story without a parent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'story', slug: 'my-story' }, template))
      .toBe(`${base}/stories/my-story`);
  });

  it('resolves a Show', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'show', slug: 'morning-edition' }, template))
      .toBe(`${base}/shows/morning-edition`);
  });

  it('resolves an Event without a parent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'event', slug: 'big-concert' }, template))
      .toBe(`${base}/events/big-concert`);
  });

  it('resolves an Event nested under a Show', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'event', slug: 'big-concert', parentSlug: 'morning-edition', parentContentType: 'show' }, template))
      .toBe(`${base}/shows/morning-edition/big-concert`);
  });

  it('resolves a Page without a parent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'page', slug: 'about' }, template))
      .toBe(`${base}/pages/about`);
  });

  it('resolves a Page nested under a LandingPage', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'page', slug: 'about', parentSlug: 'music', parentContentType: 'landingPage' }, template))
      .toBe(`${base}/music/about`);
  });

  it('resolves a LandingPage without a parent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'landingPage', slug: 'music' }, template))
      .toBe(`${base}/music`);
  });

  it('resolves a LandingPage nested under another LandingPage', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'landingPage', slug: 'jazz', parentSlug: 'music', parentContentType: 'landingPage' }, template))
      .toBe(`${base}/music/jazz`);
  });

  it('resolves a Category without a parent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'category', slug: 'news' }, template))
      .toBe(`${base}/categories/news`);
  });

  it('resolves a Category nested under a LandingPage', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'category', slug: 'news', parentSlug: 'topics', parentContentType: 'landingPage' }, template))
      .toBe(`${base}/topics/news`);
  });

  it('resolves a Person', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'person', slug: 'jane-doe' }, template))
      .toBe(`${base}/people/jane-doe`);
  });

  it('returns null for an unknown content type', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'Unknown', slug: 'foo' }, template)).toBeNull();
  });

  it('returns null when slug is absent', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'story' }, template)).toBeNull();
  });

  it('uses empty base when canonicalUrlTemplate is empty', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'show', slug: 'kcrw-music' }, ''))
      .toBe('/shows/kcrw-music');
  });

  it('falls back to default path when parent content type is unknown', () => {
    expect(siteConfig.resolveEntryUrl({ contentType: 'story', slug: 'my-story', parentSlug: 'foo', parentContentType: 'Unknown' }, template))
      .toBe(`${base}/stories/my-story`);
  });
});

// ── resolvePeople ────────────────────────────────────────────────────────────

describe('resolvePeople', () => {
  const makeEntry = (name: string, title?: string, slug?: string) => ({
    id: `id-${name}`,
    contentType: 'person',
    fields: { name, title: title ?? null, slug: slug ?? null },
  });

  it('resolves all four people collections', () => {
    const entriesById = new Map([
      ['h1', makeEntry('Host1', undefined, 'host1')],
      ['r1', makeEntry('Reporter1')],
      ['p1', makeEntry('Producer1')],
      ['g1', makeEntry('Guest1', 'Expert')],
    ]);
    const fields = {
      hosts: [{ sys: { id: 'h1' } }],
      reporters: [{ sys: { id: 'r1' } }],
      producers: [{ sys: { id: 'p1' } }],
      guests: [{ sys: { id: 'g1' } }],
    };
    const warnings: string[] = [];
    const result = siteConfig.resolvePeople(fields, entriesById, warnings);
    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0].name).toBe('Host1');
    expect(result.reporters).toHaveLength(1);
    expect(result.producers).toHaveLength(1);
    expect(result.guests).toHaveLength(1);
    expect(result.guests[0].title).toBe('Expert');
    expect(warnings).toHaveLength(0);
  });

  it('warns and skips when entry is not found', () => {
    const fields = { hosts: [{ sys: { id: 'missing' } }] };
    const warnings: string[] = [];
    const result = siteConfig.resolvePeople(fields, new Map(), warnings);
    expect(result.hosts).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing');
  });

  it('warns and skips when entry has no name', () => {
    const entriesById = new Map([
      ['h1', { id: 'h1', contentType: 'person', fields: {} }],
    ]);
    const fields = { hosts: [{ sys: { id: 'h1' } }] };
    const warnings: string[] = [];
    const result = siteConfig.resolvePeople(fields, entriesById, warnings);
    expect(result.hosts).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no name');
  });

  it('returns empty arrays when no people fields are present', () => {
    const warnings: string[] = [];
    const result = siteConfig.resolvePeople({}, new Map(), warnings);
    expect(result.hosts).toEqual([]);
    expect(result.reporters).toEqual([]);
    expect(result.producers).toEqual([]);
    expect(result.guests).toEqual([]);
    expect(warnings).toHaveLength(0);
  });
});

// ── renderThumbnailUrl ──────────────────────────────────────────────────────

describe('renderThumbnailUrl', () => {
  it('uses fit=thumb by default', () => {
    const url = new URL(siteConfig.renderThumbnailUrl({
      url: 'https://images.ctfassets.net/x/y/photo.jpg?w=2048&fm=jpg&q=80',
      width: 2048,
      height: 1536,
      focusHint: null,
    }));
    expect(url.searchParams.get('w')).toBe('1200');
  });

  it('uses fit=pad when focusHint is "nocrop"', () => {
    const url = new URL(siteConfig.renderThumbnailUrl({
      url: 'https://images.ctfassets.net/x/y/photo.jpg?w=2048&fm=jpg&q=80',
      width: 2048,
      height: 1536,
      focusHint: 'nocrop',
    }));
    expect(url.searchParams.get('w')).toBe('1200');
  });
});

// ── articleBase ──────────────────────────────────────────────────────────────

describe('articleBase', () => {
  it('has the expected top-level keys', () => {
    expect(siteConfig.articleBase).toHaveProperty('version');
    expect(siteConfig.articleBase).toHaveProperty('layout');
    expect(siteConfig.articleBase).toHaveProperty('documentStyle');
    expect(siteConfig.articleBase).toHaveProperty('textStyles');
    expect(siteConfig.articleBase).toHaveProperty('componentTextStyles');
    expect(siteConfig.articleBase).toHaveProperty('componentStyles');
    expect(siteConfig.articleBase).toHaveProperty('componentLayouts');
    expect(siteConfig.articleBase).toHaveProperty('metadata');
  });

  it('includes KCRW brand overrides (merged)', () => {
    const cts = siteConfig.articleBase.componentTextStyles as Record<string, any>;
    expect(cts['default-title'].fontName).toBe('TrebuchetMS-Bold');
    expect(cts['default-title'].textTransform).toBe('uppercase');
  });

  it('preserves base structure values where KCRW does not override', () => {
    expect(siteConfig.articleBase.version).toBe('1.7');
  });
});

// ── fieldNames / contentTypeIds re-exports ──────────────────────────────────

describe('convenience re-exports', () => {
  it('fieldNames matches siteConfig.fieldNames', () => {
    expect(fieldNames).toBe(siteConfig.fieldNames);
  });

  it('fieldNames has expected keys', () => {
    expect(fieldNames.title).toBe('title');
    expect(fieldNames.slug).toBe('slug');
    expect(fieldNames.appleNewsData).toBe('appleNewsData');
  });
});
