// site.ts — KCRW implementation of SiteConfig
//
// Forks replace this file. Framework files (fetch.ts, article.ts, etc.)
// import from here and never need fork changes.

import { DateTime } from 'luxon';
import type {
  AnfComponent,
  AfterBodyContext,
  ArticleMetadata,
  EntryUrlInput,
  ImageRole,
  ParentLookupEntry,
  ResolvedImage,
  ResolvedMediaLink,
  ResolvedParent,
  ResolvedPeople,
  ResolvedPerson,
  ResolvedStory,
} from '../types';
import type { SourcedAsset, SourcedEntry } from './entrySource';
import type { SiteConfig } from './siteConfig';
import {
  buildThumbnailUrl,
  escapeAttr,
  escapeHtml,
  friendlyStringJoin,
  IMAGE_TARGET_WIDTHS,
  mergeDeep,
  resolveAssetInfo,
  type ContentfulAssetFields,
} from './utilities';

// ── Private constants ────────────────────────────────────────────────────────

const IMAGE_QUALITY = 80;

const PEOPLE_FIELDS = {
  hostsCollection: 'hosts',
  reportersCollection: 'reporters',
  producersCollection: 'producers',
  guestsCollection: 'guests',
};

const SEO_SUBFIELDS = {
  seoMetadata: 'seoMetadata',
  canonicalUrlParent: 'canonicalUrlParent',
};

const IMAGE_SUBFIELDS = {
  asset: 'asset',
  altText: 'altText',
  caption: 'photoCaption',
  credit: 'photoCredit',
  focusHint: 'focusHint',
};

const PERSON_SUBFIELDS = {
  name: 'name',
  title: 'title',
  slug: 'slug',
};

const MEDIA_LINK_SUBFIELDS = {
  mediaUrl: 'mediaUrl',
  hosting: 'hosting',
};

// ── Private helpers ──────────────────────────────────────────────────────────

function selectBylinePeople(people: ResolvedPeople): { prefix: string; names: ResolvedPerson[] } {
  if (people.hosts.length > 0) return { prefix: 'Hosted by', names: people.hosts };
  if (people.reporters.length > 0) return { prefix: 'Reported by', names: people.reporters };
  if (people.producers.length > 0) return { prefix: 'By', names: people.producers };
  return { prefix: '', names: [] };
}

function urlWithParent(entry: EntryUrlInput): string | null {
  if (!entry.parentSlug) return null;
  switch (entry.parentContentType) {
    case 'Show': return `shows/${entry.parentSlug}/${entry.slug}`;
    case 'LandingPage': return `${entry.parentSlug}/${entry.slug}`;
    default: return null;
  }
}

function peopleComponents(
  label: string,
  people: ResolvedPerson[],
  base: string,
  opts: { includeTitle: boolean },
): AnfComponent[] {
  if (people.length === 0) return [];
  const items = people.map(p => {
    const nameHtml = p.slug
      ? `<a href="${escapeAttr(`${base}/people/${p.slug}`)}">${escapeHtml(p.name)}</a>`
      : escapeHtml(p.name);
    const text = opts.includeTitle && p.title ? `${nameHtml} - ${escapeHtml(p.title)}` : nameHtml;
    return `<li>${text}</li>`;
  });
  return [
    {
      role: 'heading4',
      text: escapeHtml(label),
      format: 'html',
      layout: 'creditsHeadingLayout',
      style: 'bodyHeadingStyle',
      textStyle: 'default-heading4',
    },
    {
      role: 'body',
      text: `<ul>${items.join('')}</ul>`,
      format: 'html',
      layout: 'creditsListLayout',
      style: 'bodyStyle',
      textStyle: 'default-body',
    },
  ];
}

function renderCreditsComponents(people: ResolvedPeople, canonicalUrlTemplate: string): AnfComponent[] {
  const base = canonicalUrlTemplate ? new URL(canonicalUrlTemplate).origin : '';
  const roleSections = [
    peopleComponents('Guests', people.guests, base, { includeTitle: true }),
    peopleComponents('Hosts', people.hosts, base, { includeTitle: false }),
    peopleComponents('Producers', people.producers, base, { includeTitle: false }),
  ].flat();
  if (roleSections.length === 0) return [];
  return [{
    role: 'container',
    identifier: 'credits',
    layout: 'creditsContainerLayout',
    components: [
      {
        role: 'heading3',
        text: 'Credits',
        format: 'html',
        layout: 'creditsHeadingLayout',
        style: 'bodyHeadingStyle',
        textStyle: 'default-heading3',
      },
      ...roleSections,
    ],
  }];
}

function resolvePersonEntries(
  fields: Record<string, unknown>,
  collectionField: string,
  entriesById: Map<string, SourcedEntry>,
  warnings: string[],
  label: string,
): ResolvedPerson[] {
  const items = (fields[collectionField] as { sys: { id: string } }[] | undefined) ?? [];
  return items.flatMap(link => {
    const id = link.sys.id;
    const entry = entriesById.get(id);
    if (!entry) {
      warnings.push(`${label} entry ${id} not found; skipped.`);
      return [];
    }
    const name = entry.fields[PERSON_SUBFIELDS.name] as string | undefined;
    if (!name) {
      warnings.push(`${label} entry ${id} has no ${PERSON_SUBFIELDS.name}; skipped.`);
      return [];
    }
    return [{
      id,
      name,
      title: (entry.fields[PERSON_SUBFIELDS.title] as string | undefined) ?? null,
      slug: (entry.fields[PERSON_SUBFIELDS.slug] as string | undefined) ?? null,
    } as ResolvedPerson];
  });
}

function hydrateAssetField(
  fields: Record<string, unknown>,
  assetFieldName: string,
  assetsById: Map<string, SourcedAsset>,
): Record<string, unknown> {
  const result = { ...fields };
  const assetLink = result[assetFieldName] as { sys?: { linkType?: string; id?: string } } | undefined;
  if (assetLink?.sys?.linkType === 'Asset' && assetLink.sys.id) {
    const asset = assetsById.get(assetLink.sys.id);
    if (asset) {
      result[assetFieldName] = {
        sys: { id: asset.id },
        fields: { file: { url: asset.url, details: { image: { width: asset.width, height: asset.height } } } },
      };
    }
  }
  return result;
}

// ── ANF brand overrides ──────────────────────────────────────────────────────

const DARK_TEXT = '#F0F0EA';
const PRIMARY_TEXT = '#201E1D';
const BORDER_LIGHT = '#E4E4D7';
const BORDER_DARK = '#343332';
const SECONDARY_TEXT = '#211E1D';
const SECONDARY_TEXT_DARK = '#EEEEDF';
const BRIGHT_TEXT = '#FF2E56';

const STYLE_OVERRIDES = {
  layout: {
    width: 1024,
    margin: 40,
  },
  documentStyle: {
    backgroundColor: '#F1F1EA',
    conditional: [{
      backgroundColor: '#1F1E1E',
      conditions: [{ preferredColorScheme: 'dark' }],
    }],
  },
  textStyles: {
    'primary-category': {},
    'default-tag-p': {},
    'default-tag-i': { fontName: 'Georgia-Italic' },
    'default-tag-em': { fontName: 'Georgia-Italic' },
    'default-tag-b': { fontName: 'Georgia-Bold' },
    'default-tag-strong': { fontName: 'Georgia-Bold' },
    'style-bold-italic': { fontName: 'Georgia-BoldItalic' },
  },
  componentTextStyles: {
    default: {
      fontName: 'Georgia',
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      linkStyle: { fontName: 'Georgia-Bold', underline: true },
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-show-title': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 16,
      textColor: BRIGHT_TEXT,
      conditional: [{ fontSize: 14, conditions: [{ maxViewportWidth: 414 }] }],
    },
    'default-title': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 64,
      lineHeight: 64,
      textColor: PRIMARY_TEXT,
      textTransform: 'uppercase',
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 42, lineHeight: 42, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-byline': {
      fontName: 'Georgia',
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      linkStyle: { fontName: 'Georgia-Bold', underline: true },
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 14, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-body': {
      fontName: 'Georgia',
      hyphenation: true,
      paragraphSpacingAfter: 20,
      paragraphSpacingBefore: 20,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { paragraphSpacingAfter: 15, paragraphSpacingBefore: 15, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-caption': {
      fontName: 'Georgia',
      fontSize: 12,
      textColor: SECONDARY_TEXT,
      textAlignment: 'left',
      conditional: [{ textColor: SECONDARY_TEXT_DARK, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading1': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 42,
      lineHeight: 42,
      textTransform: 'uppercase',
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading2': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading3': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading4': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 18,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading5': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 18,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading6': {
      fontName: 'TrebuchetMS',
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-pullquote': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 18,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'footer-section': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'footer-section-first': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'footer-section-last': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
  },
  componentStyles: {
    bodyHeadingWithBorderStyle: {
      border: { all: { width: 5, color: BORDER_LIGHT }, top: true, bottom: false, left: false, right: false },
      conditional: [{
        border: { all: { width: 5, color: BORDER_DARK }, top: true, bottom: false, left: false, right: false },
        conditions: [{ preferredColorScheme: 'dark' }],
      }],
    },
    leadPhotoCaptionStyle: {
      border: { all: { width: 1, color: BORDER_LIGHT }, bottom: true, top: false, left: false, right: false },
      conditional: [{
        border: { all: { width: 1, color: BORDER_DARK }, bottom: true, top: false, left: false, right: false },
        conditions: [{ preferredColorScheme: 'dark' }],
      }],
    },
    footerStyle: {
      backgroundColor: '#F1F1EA',
      border: { all: { width: 1, color: BORDER_LIGHT } },
      conditional: [{
        backgroundColor: '#1F1E1E',
        border: { all: { width: 1, color: BORDER_DARK } },
        conditions: [{ preferredColorScheme: 'dark' }],
      }],
    },
  },
  componentLayouts: {
    showTitleLayout: { margin: { top: 20 } },
    headerLayout: { margin: { top: 15, bottom: 8 } },
    bylineLayout: {
      margin: { top: 3, bottom: 3 },
      conditional: [{ margin: { top: 1, bottom: 1 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
    leadPhotoContainer: {
      ignoreViewportPadding: false,
      ignoreDocumentMargin: false,
      margin: { top: 5, bottom: 15 },
      conditional: [{ margin: { top: 5, bottom: 0 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
    leadPhoto: {
      ignoreViewportPadding: false,
      ignoreDocumentMargin: false,
    },
    leadPhotoCaptionLayout: {
      ignoreViewportPadding: false,
      ignoreDocumentMargin: false,
      padding: { top: 4, bottom: 13 },
    },
    bodyPhoto: { margin: { top: 15, bottom: 15 } },
    bodyHeading: { margin: { top: 10, bottom: 10 }, padding: { top: 10 } },
    bodyVideoEmbed: { margin: { top: 15, bottom: 15 } },
    bodyLayout: {
      padding: { left: 50, right: 50 },
      conditional: [{ padding: { right: 0, left: 0 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
    creditsContainerLayout: {
      margin: { top: 20 },
      padding: { left: 50, right: 50 },
      conditional: [{ padding: { left: 0, right: 0 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
    creditsHeadingLayout: {
      margin: { top: 10, bottom: 10 },
      padding: { top: 10 },
    },
    creditsListLayout: {
      margin: { top: 0, bottom: 10 },
    },
    footerLayout: {
      padding: { top: 20, bottom: 20, left: 38, right: 38 },
      conditional: [{ padding: { right: 30, left: 30 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
  },
};

// ── ANF base structure ───────────────────────────────────────────────────────

const ARTICLE_BASE_STRUCTURE = {
  version: '1.7',
  layout: { columns: 12, width: 1280, margin: 60, gutter: 20 },
  documentStyle: { backgroundColor: '#FFFFFF' },
  textStyles: {
    'style-underline': { underline: true },
  },
  componentTextStyles: {
    default: { fontName: 'Helvetica', fontSize: 18, lineHeight: 25 },
    'default-show-title': { fontName: 'Helvetica-Bold', fontSize: 13, tracking: 0.08, textColor: '#86868B' },
    'default-title': { fontName: 'Helvetica-Bold', fontSize: 45, lineHeight: 48, hyphenation: false },
    'default-intro': { fontSize: 20 },
    'default-byline': { fontSize: 14, hyphenation: false, textColor: '#86868B' },
    'default-body': { hyphenation: true, paragraphSpacingAfter: 18, paragraphSpacingBefore: 18 },
    'default-caption': { fontSize: 14, textAlignment: 'center', textColor: '#86868B' },
    'default-heading': { fontName: 'Helvetica-Bold', fontSize: 26, lineHeight: 30, hyphenation: false },
    'default-heading1': { fontName: 'Helvetica-Bold', fontSize: 26, lineHeight: 30, hyphenation: false },
    'default-heading2': { fontName: 'Helvetica-Bold', fontSize: 24, lineHeight: 28, hyphenation: false },
    'default-heading3': { fontName: 'Helvetica-Bold', fontSize: 22, lineHeight: 26, hyphenation: false },
    'default-heading4': { fontName: 'Helvetica-Bold', fontSize: 20, lineHeight: 24, hyphenation: false },
    'default-heading5': { fontName: 'Helvetica-Bold', fontSize: 18, lineHeight: 22, hyphenation: false },
    'default-heading6': { fontName: 'Helvetica-Bold', fontSize: 16, lineHeight: 20, hyphenation: false },
    'default-pullquote': { fontName: 'Helvetica-Bold', fontSize: 22, lineHeight: 28 },
    'footer-section': { hyphenation: false },
    'footer-section-first': { hyphenation: false },
    'footer-section-last': { hyphenation: false },
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
    headerLayout: { margin: { top: 20, bottom: 20 } },
    showTitleLayout: { margin: { bottom: 4 } },
    titleLayout: {},
    subheadLayout: { margin: { top: 5 } },
    bylineLayout: {},
    headerDividerLayout: { margin: { top: 20, bottom: 20 } },
    leadPhotoContainer: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { bottom: 10 } },
    leadPhoto: { ignoreViewportPadding: true, ignoreDocumentMargin: true },
    leadPhotoCaptionLayout: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { top: 2, bottom: 2 } },
    bodyLayout: { margin: { top: 20, bottom: 40 } },
    bodyHeading: { margin: { top: 20, bottom: 6 } },
    bodyPhoto: { columnStart: 1, columnSpan: 10, margin: { top: 20, bottom: 20 } },
    bodyVideoEmbed: { margin: { top: 20, bottom: 20 } },
    headerAudioLayout: { margin: { top: 20, bottom: 20 } },
    headerVideoLayout: { margin: { top: 20, bottom: 20 } },
    bodyAudioEmbed: { margin: { top: 20, bottom: 20 } },
    pullquoteLayout: { margin: { top: 24, bottom: 24 }, columnStart: 1, columnSpan: 10 },
    footerLayout: { margin: { top: 10, bottom: 40 } },
  },
  metadata: {
    generatorName: 'Apple News Contentful',
    generatorVersion: '0.1.0',
  },
};

// ── SiteConfig implementation ────────────────────────────────────────────────

export const siteConfig: SiteConfig = {
  fieldNames: {
    title: 'title',
    slug: 'slug',
    body: 'body',
    description: 'shortDescription',
    image: 'primaryImage',
    bylineDate: 'bylineDate',
    bylineCount: 'bylineCount',
    corrections: 'corrections',
    audioMedia: 'audioMedia',
    videoMedia: 'videoMedia',
    appleNewsData: 'appleNewsData',
    showsCollection: 'shows',
    categoriesCollection: 'categories',
  },

  contentTypeIds: {
    story: 'story',
    photo: 'photo',
    mediaLink: 'mediaLink',
  },

  renderImageUrl(sourceUrl: string, role: ImageRole): string {
    const normalized = sourceUrl.startsWith('//') ? `https:${sourceUrl}` : sourceUrl;
    const url = new URL(normalized);
    url.searchParams.set('w', String(IMAGE_TARGET_WIDTHS[role]));
    url.searchParams.set('fm', 'jpg');
    url.searchParams.set('q', String(IMAGE_QUALITY));
    return url.toString();
  },

  resolveImage(
    fields: Record<string, unknown>,
    role: ImageRole = 'body',
    assetsById?: Map<string, SourcedAsset>,
  ): ResolvedImage | null {
    const hydrated = assetsById
      ? hydrateAssetField(fields, IMAGE_SUBFIELDS.asset, assetsById)
      : fields;

    const asset = hydrated[IMAGE_SUBFIELDS.asset] as { sys?: { id?: string }; fields?: ContentfulAssetFields } | undefined;
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
      url: this.renderImageUrl(info.url, role),
      width: info.width ? effectiveW : undefined,
      height: scaledHeight,
      altText: hydrated[IMAGE_SUBFIELDS.altText] as string | undefined,
      caption: hydrated[IMAGE_SUBFIELDS.caption] as string | undefined,
      credit: hydrated[IMAGE_SUBFIELDS.credit] as string | undefined,
      focusHint: (hydrated[IMAGE_SUBFIELDS.focusHint] as string | undefined) ?? null,
    };
  },

  renderThumbnailUrl(image: ResolvedImage): string {
    const fit = image.focusHint === 'nocrop' ? 'pad' : 'thumb';
    const f = image.focusHint && image.focusHint !== 'nocrop' ? image.focusHint : undefined;
    return buildThumbnailUrl(image.url, image.width, image.height, IMAGE_TARGET_WIDTHS['thumb'], { fit, f });
  },

  resolveMediaLink(fields: Record<string, unknown>): ResolvedMediaLink | null {
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
  },

  resolvePeople(
    fields: Record<string, unknown>,
    entriesById: Map<string, SourcedEntry>,
    warnings: string[],
  ): ResolvedPeople {
    return {
      hosts: resolvePersonEntries(fields, PEOPLE_FIELDS.hostsCollection, entriesById, warnings, 'host'),
      reporters: resolvePersonEntries(fields, PEOPLE_FIELDS.reportersCollection, entriesById, warnings, 'reporter'),
      producers: resolvePersonEntries(fields, PEOPLE_FIELDS.producersCollection, entriesById, warnings, 'producer'),
      guests: resolvePersonEntries(fields, PEOPLE_FIELDS.guestsCollection, entriesById, warnings, 'guest'),
    };
  },

  formatByline(
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
  },

  authorNames(people: ResolvedPeople, bylineCount: number = 1): string[] {
    const { names } = selectBylinePeople(people);
    return names.slice(0, bylineCount).map(p => p.name);
  },

  resolveParentSlug(
    fields: Record<string, unknown>,
    entryContentType: string,
    entriesById?: Map<string, ParentLookupEntry>,
  ): ResolvedParent | undefined {
    switch (entryContentType) {
      case 'Story': {
        const items = fields[siteConfig.fieldNames.showsCollection] as { sys?: { id?: string } }[] | undefined;
        const showId = items?.[0]?.sys?.id;
        const show = showId ? entriesById?.get(showId) : undefined;
        if (!show) return undefined;
        const slug = show.fields[siteConfig.fieldNames.slug] as string | undefined;
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
        const slug = parentEntry.fields[siteConfig.fieldNames.slug] as string | undefined;
        if (!slug) return undefined;
        return { slug, contentType: parentEntry.contentType };
      }
      default:
        return undefined;
    }
  },

  resolveEntryUrl(entry: EntryUrlInput, canonicalUrlTemplate: string): string | null {
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
  },

  renderAfterBody(ctx: AfterBodyContext): AnfComponent[] {
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
  },

  resolveArticleMetadata(_story: ResolvedStory): ArticleMetadata {
    return { maturityRating: null };
  },

  articleBase: mergeDeep(
    ARTICLE_BASE_STRUCTURE as unknown as Record<string, unknown>,
    STYLE_OVERRIDES as unknown as Record<string, unknown>,
  ) as typeof ARTICLE_BASE_STRUCTURE,
};

export const { fieldNames, contentTypeIds } = siteConfig;
