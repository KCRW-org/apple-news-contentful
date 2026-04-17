// conventions.ts
// ── Customize this file to match your Contentful content model ──
//
// This is the primary customization point for this app.
// All field name constants, types, and resolver functions are defined here.
// KCRW-specific private helpers and ANF brand overrides (fonts, colors, dark mode)
// live in kcrw.ts and are imported below.

import { DateTime } from 'luxon';
import type { AnfComponent, ResolvedImage, ResolvedMediaLink, ResolvedPeople, ResolvedStory, ImageRole, AfterBodyContext, ResolvedParent, ParentLookupEntry, ArticleMetadata, EntryUrlInput } from '../types';
import { friendlyStringJoin, escapeHtml, mergeDeep, resolveAssetInfo, IMAGE_TARGET_WIDTHS, type ContentfulAssetFields } from './utilities';
import { selectBylinePeople, renderCreditsComponents, urlWithParent, KCRW_OVERRIDES } from './kcrw';

export type { ImageRole, AfterBodyContext, ResolvedParent, ParentLookupEntry, ArticleMetadata, EntryUrlInput };

// ── Field name constants ──────────────────────────────────────────────────────

// Field names on the Story content type
export const FIELD_NAMES = {
  title: 'title',                         // Also used for Show title and Category title
  slug: 'slug',
  body: 'body',                           // Rich Text field
  description: 'shortDescription',        // Markdown or plain text; used as ANF excerpt/intro
  image: 'primaryImage',                  // Linked entry following the image convention (see README)
  hostsCollection: 'hosts',               // Linked person entries — show hosts
  reportersCollection: 'reporters',       // Linked person entries — story reporters
  producersCollection: 'producers',       // Linked person entries — producers
  guestsCollection: 'guests',             // Linked person entries — on-air guests (with per-person title/role)
  bylineDate: 'bylineDate',               // Date string displayed in the byline
  bylineCount: 'bylineCount',             // Integer; how many contributors to show in the byline (default 1)
  corrections: 'corrections',             // Markdown; rendered after the body as a corrections section
  audioMedia: 'audioMedia',               // Linked entry for top-level audio player
  videoMedia: 'videoMedia',               // Linked entry for top-level YouTube embed
  appleNewsData: 'appleNewsData',         // Hidden JSON field for storing Apple News publish state
  showsCollection: 'shows',               // Linked show entries — first item's title appears above the story title
  categoriesCollection: 'categories',     // Linked category entries — first item's title appears in the byline
};

// Content type IDs for linked entries
export const CONTENT_TYPE_IDS = {
  photo: 'photo',         // Linked image entry type
  mediaLink: 'mediaLink', // Embedded audio/video entry type
  person: 'person',       // Byline person entry type
  category: 'category',   // Category page entry type
};

// Sub-field names on seoMetadata entries.
// `seoMetadata` is a linked entry on Page, LandingPage, and Category entries.
// `canonicalUrlParent` within it is a linked entry whose slug forms the URL parent segment.
export const SEO_SUBFIELDS = {
  seoMetadata: 'seoMetadata',
  canonicalUrlParent: 'canonicalUrlParent',
};

// Sub-field names on photo entries.
// The photo entry must expose an `asset` field (Contentful Asset) with url/width/height.
// Images are rendered at their original aspect ratio — no cropping is applied.
export const IMAGE_SUBFIELDS = {
  asset: 'asset',
  altText: 'altText',
  caption: 'photoCaption',
  credit: 'photoCredit',
  focusHint: 'focusHint',
};

// Sub-field names on person entries.
// `title` is the per-person role label (e.g. "Historian" on a guest); may be absent for hosts/producers.
// `slug` drives the canonical URL for linking in the credits block.
export const PERSON_SUBFIELDS = {
  name: 'name',
  title: 'title',
  slug: 'slug',
};

// Sub-field names on mediaLink entries.
// `mediaUrl` holds either a YouTube or SoundStack/MP3 URL.
// `hosting` distinguishes the type.
export const MEDIA_LINK_SUBFIELDS = {
  mediaUrl: 'mediaUrl',
  hosting: 'hosting', // 'youtube' | 'audio'
};

// ── Resolver functions ────────────────────────────────────────────────────────
// These contain org-specific logic. Override these when your content model
// differs from the defaults below.

/** Default quality passed to the Contentful Images API as `q=`. */
const IMAGE_QUALITY = 80;

/**
 * Transforms a Contentful asset URL into a standardized delivery URL using the Contentful Images API.
 *
 * Contract:
 * - Requests JPEG (`fm=jpg`) for all roles — Apple News does not support WebP.
 * - Constrains only width; height scales proportionally. No `fit=` is set because we aren't cropping.
 * - Preserves any pre-existing query params on the source URL.
 *
 * Override if your deployment wants a different format, width schedule, or transform pipeline.
 */
export function renderImageUrl(sourceUrl: string, role: ImageRole): string {
  const normalized = sourceUrl.startsWith('//') ? `https:${sourceUrl}` : sourceUrl;
  const url = new URL(normalized);
  url.searchParams.set('w', String(IMAGE_TARGET_WIDTHS[role]));
  url.searchParams.set('fm', 'jpg');
  url.searchParams.set('q', String(IMAGE_QUALITY));
  return url.toString();
}

/**
 * Extracts a ResolvedImage from a linked photo entry's fields.
 * `fields` is the raw fields object from CMA, pre-scoped to the locale.
 * `role` controls which target width is applied via renderImageUrl; defaults to 'body'.
 *
 * Override if your image entries have a different structure
 * (e.g. a direct Contentful asset link rather than a nested photo entry).
 */
export function resolveImage(
  fields: Record<string, unknown>,
  role: ImageRole = 'body',
): ResolvedImage | null {
  const asset = fields[IMAGE_SUBFIELDS.asset] as { sys?: { id?: string }; fields?: ContentfulAssetFields } | undefined;
  const info = resolveAssetInfo(asset);
  if (!info) return null;

  const targetW = IMAGE_TARGET_WIDTHS[role];
  const effectiveW = info.width && info.width < targetW ? info.width : targetW;
  const scaledHeight =
    info.width && info.height
      ? Math.round(info.height * (effectiveW / info.width))
      : info.height;

  return {
    id: info.id,
    url: renderImageUrl(info.url, role),
    width: info.width ? effectiveW : undefined,
    height: scaledHeight,
    altText: fields[IMAGE_SUBFIELDS.altText] as string | undefined,
    caption: fields[IMAGE_SUBFIELDS.caption] as string | undefined,
    credit: fields[IMAGE_SUBFIELDS.credit] as string | undefined,
    focusHint: (fields[IMAGE_SUBFIELDS.focusHint] as string | undefined) ?? null,
  };
}

/**
 * Resolves a mediaLink entry's locale-scoped fields to a ResolvedMediaLink, or null.
 * `fields` is the entry's fields object pre-scoped to the locale.
 *
 * Override if your media entries use different field names or hosting values.
 */
export function resolveMediaLink(fields: Record<string, unknown>): ResolvedMediaLink | null {
  const url = fields[MEDIA_LINK_SUBFIELDS.mediaUrl] as string | undefined;
  const hosting = fields[MEDIA_LINK_SUBFIELDS.hosting] as string | undefined;
  if (!url) return null;
  try { new URL(url); } catch { return null; }
  if (hosting === 'youtube') return { type: 'youtube', url };
  if (hosting === 'iframe' && (url.includes('youtube.com') || url.includes('youtu.be'))) return { type: 'youtube', url };
  if (hosting === 'soundstack') return { type: 'audio', url };
  if (hosting === 'soundstack-podcast') return { type: 'audio', url };
  if (hosting === 'generic') return { type: 'audio', url };
  if (hosting === 'cloudfront') return { type: 'audio', url };
  return null;
}

/**
 * Formats the byline line that appears under the story title.
 *
 * Structure: `{prefix} {names} • {date} • {category}`, joined with ` • `.
 * Any segment that resolves to empty is dropped; if all are empty, returns null.
 *
 * Override to change prefix wording, separators, or date formatting.
 * Override selectBylinePeople in kcrw.ts to change the priority rule or prefix labels.
 */
export function formatByline(
  people: ResolvedPeople,
  date: string | null,
  categoryTitle: string | null,
  bylineCount: number = 1,
): string | null {
  const parts: string[] = [];

  const { prefix, names } = selectBylinePeople(people);
  if (names.length > 0) {
    parts.push(`${prefix} ${friendlyStringJoin(names.slice(0, bylineCount).map(p => p.name))}`);
  }

  if (date) {
    const dt = DateTime.fromISO(date);
    if (!dt.isValid) {
      console.warn(`formatByline: invalid date value "${date}" — omitting date from byline`);
    } else {
      parts.push(dt.toFormat('cccc, LLLL d, yyyy'));
    }
  }

  if (categoryTitle) parts.push(categoryTitle);

  return parts.length > 0 ? parts.join(' \u2022 ') : null;
}

/**
 * Returns the author name strings for ANF metadata.authors, using the same
 * priority rule as the byline (hosts → reporters → producers; guests excluded).
 * Respects bylineCount for consistency with the rendered byline.
 */
export function authorNames(people: ResolvedPeople, bylineCount: number = 1): string[] {
  const { names } = selectBylinePeople(people);
  return names.slice(0, bylineCount).map(p => p.name);
}

// ── After-body content ────────────────────────────────────────────────────────
//
// `renderAfterBody` is the extensibility hook for anything that appends to the article
// after the main body. Today it emits the corrections section and credits block.

/**
 * Returns ANF components to append after the body section.
 * Override to add or reorder trailing content (corrections, credits, etc.).
 * Override renderCreditsComponent in kcrw.ts to change credits formatting.
 */
export function renderAfterBody(ctx: AfterBodyContext): AnfComponent[] {
  const components: AnfComponent[] = [];

  if (ctx.story.corrections) {
    components.push({
      role: 'body',
      identifier: 'corrections',
      text: `<p><strong>Correction:</strong> ${escapeHtml(ctx.story.corrections)}</p>`,
      format: 'html',
      layout: 'bodyLayout',
      style: 'bodyStyle',
    });
  }

  components.push(...renderCreditsComponents(ctx.story.people, ctx.canonicalUrlTemplate));

  return components;
}

/**
 * Returns entry-derived Apple News article metadata fields for a story.
 * Override to derive values from entry fields — e.g. set `maturityRating` based on
 * a content category, or `isSponsored` based on a sponsorship flag on the entry.
 *
 * Per-request flags set by the editor UI (isCandidateToBeFeatured, isSponsored)
 * are merged on top, so UI selections take precedence over values returned here.
 */
export function resolveArticleMetadata(_story: ResolvedStory): ArticleMetadata {
  return { maturityRating: null };
}

/**
 * Resolves the parent slug for a linked entry from its (locale-scoped, flat) fields.
 * Used by fetch.ts when building hyperlink URLs that require a parent context.
 *
 * Override to change which field provides the parent context, or to support
 * additional content types with different parent relationships.
 */
export function resolveParentSlug(
  fields: Record<string, unknown>,
  entryContentType: string,
  entriesById?: Map<string, ParentLookupEntry>,
): ResolvedParent | undefined {
  switch (entryContentType) {
    case 'Story': {
      const items = fields[FIELD_NAMES.showsCollection] as { sys?: { id?: string } }[] | undefined;
      const showId = items?.[0]?.sys?.id;
      const show = showId ? entriesById?.get(showId) : undefined;
      if (!show) return undefined;
      const slug = show.fields[FIELD_NAMES.slug] as string | undefined;
      if (!slug) return undefined;
      return { slug, contentType: show.contentType };
    }
    case 'Page':
    case 'LandingPage':
    case 'Category': {
      if (!entriesById) return undefined;
      const seoLink = fields[SEO_SUBFIELDS.seoMetadata] as { sys?: { id?: string } } | undefined;
      const seoEntry = seoLink?.sys?.id ? entriesById.get(seoLink.sys.id) : undefined;
      if (!seoEntry) return undefined;
      const parentLink = seoEntry.fields[SEO_SUBFIELDS.canonicalUrlParent] as { sys?: { id?: string } } | undefined;
      const parentEntry = parentLink?.sys?.id ? entriesById.get(parentLink.sys.id) : undefined;
      if (!parentEntry) return undefined;
      const slug = parentEntry.fields[FIELD_NAMES.slug] as string | undefined;
      if (!slug) return undefined;
      return { slug, contentType: parentEntry.contentType };
    }
    default:
      return undefined;
  }
}

/**
 * Resolves an internal entry hyperlink target to a canonical URL, or null.
 * Override this to add cases for other content types in your schema.
 */
export function resolveEntryUrl(entry: EntryUrlInput, canonicalUrlTemplate: string): string | null {
  if (!entry.slug) return null;
  const base = canonicalUrlTemplate ? new URL(canonicalUrlTemplate).origin : '';
  let fullSlug: string | null = null;
  switch (entry.contentType) {
    case 'Show':
      return `${base}/shows/${entry.slug}`;
    case 'Story':
      if (entry.parentContentType === 'Show') {
        return `${base}/shows/${entry.parentSlug}/stories/${entry.slug}`;
      }
      fullSlug = urlWithParent(entry);
      return fullSlug ? `${base}/${fullSlug}` : `${base}/stories/${entry.slug}`;
    case 'Event':
      fullSlug = urlWithParent(entry);
      return fullSlug ? `${base}/${fullSlug}` : `${base}/events/${entry.slug}`;
    case 'Page':
      fullSlug = urlWithParent(entry);
      return fullSlug ? `${base}/${fullSlug}` : `${base}/pages/${entry.slug}`;
    case 'LandingPage':
      fullSlug = urlWithParent(entry);
      return fullSlug ? `${base}/${fullSlug}` : `${base}/${entry.slug}`;
    case 'Category':
      fullSlug = urlWithParent(entry);
      return fullSlug ? `${base}/${fullSlug}` : `${base}/categories/${entry.slug}`;
    case 'Person':
      return `${base}/people/${entry.slug}`;
    default:
      return null;
  }
}

// ── ANF document base ─────────────────────────────────────────────────────────
// Generic structural skeleton. KCRW brand overrides are merged in via KCRW_OVERRIDES.
// articleCustomizationsJson is applied last per-build in buildArticle().

const ARTICLE_BASE_STRUCTURE = {
  version: '1.7',
  layout: { columns: 12, width: 1280, margin: 60, gutter: 20 },
  documentStyle: { backgroundColor: '#FFFFFF' },
  textStyles: {
    'style-underline': { underline: true },
  },
  componentTextStyles: {
    default:             { fontName: 'Helvetica', fontSize: 18, lineHeight: 25 },
    'default-show-title':{ fontName: 'Helvetica-Bold', fontSize: 13, tracking: 0.08, textColor: '#86868B' },
    'default-title':     { fontName: 'Helvetica-Bold', fontSize: 45, lineHeight: 48, hyphenation: false },
    'default-intro':     { fontSize: 20 },
    'default-byline':    { fontSize: 14, hyphenation: false, textColor: '#86868B' },
    'default-body':      { hyphenation: true, paragraphSpacingAfter: 18, paragraphSpacingBefore: 18 },
    'default-caption':   { fontSize: 14, textAlignment: 'center', textColor: '#86868B' },
    'default-heading':   { fontName: 'Helvetica-Bold', fontSize: 26, lineHeight: 30, hyphenation: false },
    'default-heading1':  { fontName: 'Helvetica-Bold', fontSize: 26, lineHeight: 30, hyphenation: false },
    'default-heading2':  { fontName: 'Helvetica-Bold', fontSize: 24, lineHeight: 28, hyphenation: false },
    'default-heading3':  { fontName: 'Helvetica-Bold', fontSize: 22, lineHeight: 26, hyphenation: false },
    'default-heading4':  { fontName: 'Helvetica-Bold', fontSize: 20, lineHeight: 24, hyphenation: false },
    'default-heading5':  { fontName: 'Helvetica-Bold', fontSize: 18, lineHeight: 22, hyphenation: false },
    'default-heading6':  { fontName: 'Helvetica-Bold', fontSize: 16, lineHeight: 20, hyphenation: false },
    'default-pullquote': { fontName: 'Helvetica-Bold', fontSize: 22, lineHeight: 28 },
    'footer-section':       { hyphenation: false },
    'footer-section-first': { hyphenation: false },
    'footer-section-last':  { hyphenation: false },
  },
  componentStyles: {
    headerStyle: {}, showTitleStyle: {}, titleStyle: {}, subheadStyle: {}, bylineStyle: {},
    leadPhotoContainerStyle: {}, leadPhotoStyle: {}, leadPhotoCaptionStyle: {},
    bodyStyle: {}, bodyHeadingStyle: {}, bodyHeadingWithBorderStyle: {},
    bodyPhotoStyle: {}, bodyVideoEmbedStyle: {},
    headerAudioStyle: {}, headerVideoStyle: {}, bodyAudioEmbedStyle: {},
    pullquoteStyle: {},
    footerStyle: {},
  },
  componentLayouts: {
    headerLayout:           { margin: { top: 20, bottom: 20 } },
    showTitleLayout:        { margin: { bottom: 4 } },
    titleLayout:            {},
    subheadLayout:          { margin: { top: 5 } },
    bylineLayout:           {},
    headerDividerLayout:    { margin: { top: 20, bottom: 20 } },
    leadPhotoContainer:     { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { bottom: 10 } },
    leadPhoto:              { ignoreViewportPadding: true, ignoreDocumentMargin: true },
    leadPhotoCaptionLayout: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { top: 2, bottom: 2 } },
    bodyLayout:             { margin: { top: 20, bottom: 40 } },
    bodyHeading:            { margin: { top: 20, bottom: 6 } },
    bodyPhoto:              { columnStart: 1, columnSpan: 10, margin: { top: 20, bottom: 20 } },
    bodyVideoEmbed:         { margin: { top: 20, bottom: 20 } },
    headerAudioLayout:      { margin: { top: 20, bottom: 20 } },
    headerVideoLayout:      { margin: { top: 20, bottom: 20 } },
    bodyAudioEmbed:         { margin: { top: 20, bottom: 20 } },
    pullquoteLayout:        { margin: { top: 24, bottom: 24 }, columnStart: 1, columnSpan: 10 },
    footerLayout:           { margin: { top: 10, bottom: 40 } },
  },
  metadata: {
    generatorName: 'Apple News Contentful',
    generatorVersion: '0.1.0',
  },
};

export const ARTICLE_BASE = mergeDeep(
  ARTICLE_BASE_STRUCTURE as unknown as Record<string, unknown>,
  KCRW_OVERRIDES as unknown as Record<string, unknown>,
) as typeof ARTICLE_BASE_STRUCTURE;
