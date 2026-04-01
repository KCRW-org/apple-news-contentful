// conventions.ts
// ── Customize this file to match your Contentful content model ──
//
// This is the primary customization point for this app.
// All field names and content type IDs used by fetch.ts and article.ts
// are defined here. Override the exported resolver functions below
// to change how data is transformed (e.g. byline formatting, image resolution).

import type { ResolvedImage } from '../types';

// Field names on the Story content type
export const FIELD_NAMES = {
  title: 'title',
  slug: 'slug',
  body: 'body',                           // Rich Text field
  description: 'shortDescription',        // Markdown or plain text; used as ANF excerpt/intro
  image: 'primaryImage',                  // Linked entry following the image convention (see README)
  bylineCollections: ['hostsCollection', 'reportersCollection'],
  bylineCount: 'bylineCount',             // Number: max byline names to show
  bylineDate: 'bylineDate',               // Date string displayed in the byline
  corrections: 'corrections',             // Markdown; rendered after the body as a corrections section
  audioMedia: 'audioMedia',               // Linked entry for top-level audio player
  videoMedia: 'videoMedia',               // Linked entry for top-level YouTube embed
  appleNewsData: 'appleNewsData',         // Hidden JSON field for storing Apple News publish state
};

// Content type IDs for linked entries
export const CONTENT_TYPE_IDS = {
  photo: 'photo',         // Linked image entry type
  mediaLink: 'mediaLink', // Embedded audio/video entry type
  person: 'person',       // Byline person entry type
};

// Sub-field names on photo entries.
// The photo entry must expose an `asset` field (Contentful Asset) with url/width/height.
// Images are rendered at their original aspect ratio — no cropping is applied.
export const IMAGE_SUBFIELDS = {
  asset: 'asset',
  altText: 'altText',
  caption: 'photoCaption',
  credit: 'photoCredit',
};

// Sub-field names on person entries used in bylines.
export const PERSON_SUBFIELDS = {
  name: 'name',
};

// Sub-field names on mediaLink entries.
// `mediaUrl` holds either a YouTube or SoundStack/MP3 URL.
// `hosting` distinguishes the type.
export const MEDIA_LINK_SUBFIELDS = {
  mediaUrl: 'mediaUrl',
  hosting: 'hosting', // 'youtube' | 'soundstack'
};

// ── Resolver functions ──────────────────────────────────────────────────────
// These contain org-specific logic. Override these when your content model
// differs from the defaults below.

/**
 * Builds the byline string from person names and an optional date.
 * Override to change formatting, separators, or date display.
 */
export function buildByline(names: string[], date: string | null): string {
  const parts: string[] = [];
  if (names.length > 0) {
    const joined =
      names.length === 1
        ? names[0]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    parts.push('by ' + joined);
  }
  if (date) {
    parts.push(
      new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    );
  }
  return parts.join(' \uFF5C ');  // ｜ fullwidth vertical bar
}

/**
 * Extracts a ResolvedImage from a linked photo entry's fields.
 * `fields` is the raw fields object from CMA, pre-scoped to the locale.
 *
 * Override if your image entries have a different structure
 * (e.g. a direct Contentful asset link rather than a nested photo entry).
 */
export function resolveImage(
  fields: Record<string, unknown>,
): ResolvedImage | null {
  const asset = fields[IMAGE_SUBFIELDS.asset] as Record<string, unknown> | undefined;
  if (!asset?.url) return null;
  return {
    url: asset.url as string,
    width: asset.width as number | undefined,
    height: asset.height as number | undefined,
    altText: fields[IMAGE_SUBFIELDS.altText] as string | undefined,
    caption: fields[IMAGE_SUBFIELDS.caption] as string | undefined,
    credit: fields[IMAGE_SUBFIELDS.credit] as string | undefined,
  };
}

/**
 * Resolves an internal entry hyperlink target to a canonical URL, or null.
 *
 * `entry` has `__typename`, `slug`, and optionally `parentSlug`
 * (the slug of the story's first linked show, pre-resolved by fetch.ts).
 *
 * Override this to add cases for other content types in your schema.
 * The base URL is derived from `canonicalUrlTemplate` so links share the same domain.
 */
export function resolveEntryUrl(
  entry: { __typename: string; slug?: string; parentSlug?: string },
  canonicalUrlTemplate: string,
): string | null {
  if (!entry.slug) return null;
  const base = canonicalUrlTemplate ? new URL(canonicalUrlTemplate).origin : '';
  switch (entry.__typename) {
    case 'Story':
      return entry.parentSlug
        ? `${base}/shows/${entry.parentSlug}/stories/${entry.slug}`
        : `${base}/stories/${entry.slug}`;
    // Add cases for other linkable content types, e.g.:
    // case 'Show': return `${base}/shows/${entry.slug}`;
    default:
      return null;
  }
}
