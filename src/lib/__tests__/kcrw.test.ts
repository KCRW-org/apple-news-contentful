// Tests for KCRW-specific logic that lives in kcrw.ts:
// selectBylinePeople, renderCreditsComponents, urlWithParent.

import { describe, it, expect } from 'vitest';
import { selectBylinePeople, renderCreditsComponents, urlWithParent } from '../kcrw';
import type { ResolvedPeople, ResolvedPerson, EntryUrlInput, AnfComponent } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptyPeople = (): ResolvedPeople => ({ hosts: [], reporters: [], producers: [], guests: [] });
const person = (overrides: Partial<ResolvedPerson> & { name: string }): ResolvedPerson => ({
  id: overrides.id ?? `id-${overrides.name.replace(/\s+/g, '-').toLowerCase()}`,
  name: overrides.name,
  title: overrides.title ?? null,
  slug: overrides.slug ?? null,
});

// ── selectBylinePeople ───────────────────────────────────────────────────────

describe('selectBylinePeople', () => {
  it('returns hosts with "Hosted by" when hosts are present', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex' })];
    people.reporters = [person({ name: 'Jane' })];
    const result = selectBylinePeople(people);
    expect(result.prefix).toBe('Hosted by');
    expect(result.names).toEqual(people.hosts);
  });

  it('returns reporters with "Reported by" when no hosts but reporters present', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane' })];
    people.producers = [person({ name: 'Sam' })];
    const result = selectBylinePeople(people);
    expect(result.prefix).toBe('Reported by');
    expect(result.names).toEqual(people.reporters);
  });

  it('returns producers with "By" when only producers present', () => {
    const people = emptyPeople();
    people.producers = [person({ name: 'Sam' })];
    const result = selectBylinePeople(people);
    expect(result.prefix).toBe('By');
    expect(result.names).toEqual(people.producers);
  });

  it('returns empty prefix and names when only guests are present', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Guest' })];
    const result = selectBylinePeople(people);
    expect(result.prefix).toBe('');
    expect(result.names).toEqual([]);
  });

  it('returns empty prefix and names when all collections are empty', () => {
    const result = selectBylinePeople(emptyPeople());
    expect(result.prefix).toBe('');
    expect(result.names).toEqual([]);
  });
});

// ── renderCreditsComponents ──────────────────────────────────────────────────

describe('renderCreditsComponents', () => {
  const template = 'https://www.kcrw.com/some/path';
  const innerComps = (comps: ReturnType<typeof renderCreditsComponents>) =>
    (comps[0]?.components ?? []) as AnfComponent[];
  const allText = (comps: ReturnType<typeof renderCreditsComponents>) =>
    innerComps(comps).map(c => c.text as string ?? '').join('');

  it('returns empty array when no people are present', () => {
    expect(renderCreditsComponents(emptyPeople(), template)).toEqual([]);
  });

  it('wraps everything in a single container with identifier "credits"', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const comps = renderCreditsComponents(people, template);
    expect(comps).toHaveLength(1);
    expect(comps[0].role).toBe('container');
    expect(comps[0].identifier).toBe('credits');
  });

  it('starts with a heading3 "Credits" component inside the container', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const children = innerComps(renderCreditsComponents(people, template));
    expect(children[0].role).toBe('heading3');
    expect(children[0].text).toBe('Credits');
  });

  it('renders each role as a heading4 followed by a body with ul', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Dr. Jane', title: 'Historian', slug: 'jane' })];
    const children = innerComps(renderCreditsComponents(people, template));
    expect(children[1].role).toBe('heading4');
    expect(children[1].text).toBe('Guests');
    expect(children[2].role).toBe('body');
    expect(children[2].text).toContain('<ul><li><a href="https://www.kcrw.com/people/jane">Dr. Jane</a> - Historian</li></ul>');
  });

  it('omits title from hosts even when present', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', title: 'Senior Host', slug: 'alex' })];
    const text = allText(renderCreditsComponents(people, template));
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/alex">Alex</a></li>');
    expect(text).not.toContain('Senior Host');
  });

  it('renders plain text when person has no slug', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: null })];
    const text = allText(renderCreditsComponents(people, template));
    expect(text).toContain('<li>Alex</li>');
    expect(text).not.toContain('<a ');
  });

  it('renders each person as a separate li', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' }), person({ name: 'Jordan', slug: 'jordan' })];
    const text = allText(renderCreditsComponents(people, template));
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/alex">Alex</a></li>');
    expect(text).toContain('<li><a href="https://www.kcrw.com/people/jordan">Jordan</a></li>');
  });

  it('escapes HTML-unsafe characters in names and titles', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Jane <script>', title: 'Role & More', slug: 'jane' })];
    const text = allText(renderCreditsComponents(people, template));
    expect(text).toContain('Jane &lt;script&gt;');
    expect(text).toContain('Role &amp; More');
  });

  it('returns empty array when only reporters are present (not listed in credits)', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane' })];
    expect(renderCreditsComponents(people, template)).toEqual([]);
  });
});

// ── urlWithParent ────────────────────────────────────────────────────────────

describe('urlWithParent', () => {
  it('builds a shows/* path for a Show parent', () => {
    const entry: EntryUrlInput = { contentType: 'Story', slug: 'my-story', parentSlug: 'morning-edition', parentContentType: 'Show' };
    expect(urlWithParent(entry)).toBe('shows/morning-edition/my-story');
  });

  it('builds a bare slug path for a LandingPage parent', () => {
    const entry: EntryUrlInput = { contentType: 'LandingPage', slug: 'jazz', parentSlug: 'music', parentContentType: 'LandingPage' };
    expect(urlWithParent(entry)).toBe('music/jazz');
  });

  it('returns null when parentSlug is absent', () => {
    expect(urlWithParent({ contentType: 'Story', slug: 'my-story' })).toBeNull();
  });

  it('returns null for an unknown parentContentType', () => {
    const entry: EntryUrlInput = { contentType: 'Story', slug: 'my-story', parentSlug: 'foo', parentContentType: 'Unknown' };
    expect(urlWithParent(entry)).toBeNull();
  });
});
