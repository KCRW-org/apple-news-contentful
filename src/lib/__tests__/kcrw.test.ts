// Tests for KCRW-specific logic that lives in kcrw.ts:
// selectBylinePeople, renderCreditsComponent, urlWithParent.

import { describe, it, expect } from 'vitest';
import { selectBylinePeople, renderCreditsComponent, urlWithParent } from '../kcrw';
import type { ResolvedPeople, ResolvedPerson, EntryUrlInput } from '../../types';

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

// ── renderCreditsComponent ───────────────────────────────────────────────────

describe('renderCreditsComponent', () => {
  const template = 'https://www.kcrw.com/some/path';

  it('returns null when no people are present', () => {
    expect(renderCreditsComponent(emptyPeople(), template)).toBeNull();
  });

  it('includes a "Credits:" label', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' })];
    const comp = renderCreditsComponent(people, template)!;
    expect((comp.text as string).startsWith('<p><strong>Credits:</strong></p>')).toBe(true);
  });

  it('includes guests with title and link', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Dr. Jane', title: 'Historian', slug: 'jane' })];
    const html = renderCreditsComponent(people, template)!.text as string;
    expect(html).toContain('Guest(s): <a href="https://www.kcrw.com/people/jane">Dr. Jane</a> - Historian');
  });

  it('omits title from hosts even when present', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', title: 'Senior Host', slug: 'alex' })];
    const html = renderCreditsComponent(people, template)!.text as string;
    expect(html).toContain('Host(s): <a href="https://www.kcrw.com/people/alex">Alex</a>');
    expect(html).not.toContain('Senior Host');
  });

  it('renders plain text when person has no slug', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: null })];
    const html = renderCreditsComponent(people, template)!.text as string;
    expect(html).toContain('Host(s): Alex');
    expect(html).not.toContain('<a ');
  });

  it('separates multiple people with "; "', () => {
    const people = emptyPeople();
    people.hosts = [person({ name: 'Alex', slug: 'alex' }), person({ name: 'Jordan', slug: 'jordan' })];
    const html = renderCreditsComponent(people, template)!.text as string;
    expect(html).toContain('Alex</a>; <a');
  });

  it('escapes HTML-unsafe characters in names and titles', () => {
    const people = emptyPeople();
    people.guests = [person({ name: 'Jane <script>', title: 'Role & More', slug: 'jane' })];
    const html = renderCreditsComponent(people, template)!.text as string;
    expect(html).toContain('Jane &lt;script&gt;');
    expect(html).toContain('Role &amp; More');
  });

  it('returns null when only reporters are present (not listed in credits)', () => {
    const people = emptyPeople();
    people.reporters = [person({ name: 'Jane' })];
    expect(renderCreditsComponent(people, template)).toBeNull();
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
