// kcrw.ts
// ── KCRW-specific ANF brand overrides and private helper implementations ──────
//
// conventions.ts imports the helpers and KCRW_OVERRIDES from here.
// To adapt this app to a different site, replace the implementations below
// and update KCRW_OVERRIDES to match the new brand.

import type { AnfComponent, EntryUrlInput, ResolvedImage, ResolvedPeople, ResolvedPerson } from '../types';
import { escapeHtml, escapeAttr, buildThumbnailUrl, IMAGE_TARGET_WIDTHS } from './utilities';

// ── Byline helpers ────────────────────────────────────────────────────────────

/**
 * Picks the active collection and prefix label for the byline line.
 * Priority: hosts → reporters → producers. Guests never drive the byline prefix.
 */
export function selectBylinePeople(people: ResolvedPeople): { prefix: string; names: ResolvedPerson[] } {
  if (people.hosts.length > 0)     return { prefix: 'Hosted by',    names: people.hosts };
  if (people.reporters.length > 0) return { prefix: 'Reported by',  names: people.reporters };
  if (people.producers.length > 0) return { prefix: 'By',           names: people.producers };
  return { prefix: '', names: [] };
}

// ── Credits helpers ───────────────────────────────────────────────────────────

/**
 * Builds the Credits body component, or returns null if there are no guests, hosts, or producers.
 * Reporters aren't listed in credits — they're already named in the byline.
 */
export function renderCreditsComponent(people: ResolvedPeople, canonicalUrlTemplate: string): AnfComponent | null {
  const base = canonicalUrlTemplate ? new URL(canonicalUrlTemplate).origin : '';

  const guestLine   = peopleLine('Guest(s)',    people.guests,    base, { includeTitle: true });
  const hostLine    = peopleLine('Host(s)',     people.hosts,     base, { includeTitle: false });
  const producerLine = peopleLine('Producer(s)', people.producers, base, { includeTitle: false });

  const lines = [guestLine, hostLine, producerLine].filter(Boolean) as string[];
  if (lines.length === 0) return null;

  return {
    role: 'body',
    identifier: 'credits',
    text: ['<p><strong>Credits:</strong></p>', ...lines].join(''),
    format: 'html',
    layout: 'bodyLayout',
    style: 'bodyStyle',
  };
}

function peopleLine(
  label: string,
  people: ResolvedPerson[],
  base: string,
  opts: { includeTitle: boolean },
): string | null {
  if (people.length === 0) return null;
  const rendered = people.map(p => {
    const nameHtml = p.slug
      ? `<a href="${escapeAttr(`${base}/people/${p.slug}`)}">${escapeHtml(p.name)}</a>`
      : escapeHtml(p.name);
    return opts.includeTitle && p.title ? `${nameHtml} - ${escapeHtml(p.title)}` : nameHtml;
  });
  return `<p>${label}: ${rendered.join('; ')}</p>`;
}

// ── Thumbnail URL ─────────────────────────────────────────────────────────────

/**
 * Builds a Contentful Images API thumbnail URL from a resolved image.
 *
 * Delegates aspect-ratio clamping to `buildThumbnailUrl` (utilities.ts).
 * Maps KCRW's `focusHint` field to the appropriate Contentful crop params:
 * - `'nocrop'` → `fit=pad` (letterbox; no pixels discarded)
 * - any other value → `fit=thumb&f={focusHint}` (smart crop to focal point)
 * - `null` / absent → `fit=thumb` with Contentful's default focal point
 */
export function renderThumbnailUrl(image: ResolvedImage): string {
  const fit = image.focusHint === 'nocrop' ? 'pad' : 'thumb';
  const f = image.focusHint && image.focusHint !== 'nocrop' ? image.focusHint : undefined;
  return buildThumbnailUrl(image.url, image.width, image.height, IMAGE_TARGET_WIDTHS['thumb'], { fit, f });
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function urlWithParent(entry: EntryUrlInput): string | null {
  if (!entry.parentSlug) return null;
  switch (entry.parentContentType) {
    case 'Show':        return `shows/${entry.parentSlug}/${entry.slug}`;
    case 'LandingPage': return `${entry.parentSlug}/${entry.slug}`;
    default:            return null;
  }
}

// ── ANF brand overrides ───────────────────────────────────────────────────────
// Applied on top of ARTICLE_BASE_STRUCTURE in conventions.ts.
// Fonts: Georgia family for body/caption/byline/footer; Trebuchet MS for headings.

const DARK_TEXT    = '#F0F0EA'; // hsl(60,19%,93%)
const PRIMARY_TEXT = '#201E1D'; // hsl(12,4%,12%)
const BORDER_LIGHT = '#E4E4D7'; // hsl(59,20%,87%)
const BORDER_DARK  = '#343332'; // hsl(18,2%,20%)
const KCRW_RED = '#FF2E56'; // hsl(349,100%,55%)
const KCRW_GREY = '#211E1D'; // hsl(12,4%,12%)
const KCRW_GREY_DARK = '#EEEEDF'; // hsl(60,19%,93%)

export const KCRW_OVERRIDES = {
  layout: {
    width: 1024,
    margin: 40,
  },

  documentStyle: {
    backgroundColor: '#F1F1EA', // hsl(60,20%,93%)
    conditional: [{
      backgroundColor: '#1F1E1E', // hsl(12,1%,12%)
      conditions: [{ preferredColorScheme: 'dark' }],
    }],
  },

  textStyles: {
    'primary-category': {},
    'default-tag-p': {},
    'default-tag-i':      { fontName: 'Georgia-Italic' },
    'default-tag-em':     { fontName: 'Georgia-Italic' },
    'default-tag-b':      { fontName: 'Georgia-Bold' },
    'default-tag-strong': { fontName: 'Georgia-Bold' },
    'style-bold-italic':  { fontName: 'Georgia-BoldItalic' },
  },

  componentTextStyles: {
    default: {
      fontName: 'Georgia',
      fontSize: 18,
      lineHeight: 28,
      textColor: PRIMARY_TEXT,
      linkStyle: {
        fontName: 'Georgia-Bold',
        underline: true,
      },
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 17, lineHeight: 24, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-show-title': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 16,
      textTransform: 'uppercase',
      textColor: KCRW_RED,
      conditional: [
        { textColor: KCRW_RED, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 14, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'default-title': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 42,
      lineHeight: 42,
      textColor: PRIMARY_TEXT,
      textTransform: 'uppercase',
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-intro': {
      fontName: 'Georgia',
      fontSize: 16,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-byline': {
      fontName: 'Georgia',
      textColor: PRIMARY_TEXT,
      linkStyle: {
        fontName: 'Georgia-Bold',
        underline: true,
      },
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
      lineHeight: 18,
      textColor: KCRW_GREY,
      textAlignment: 'left',
      conditional: [{ textColor: KCRW_GREY_DARK, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      lineHeight: 26,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading1': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 42,
      lineHeight: 46,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading2': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      lineHeight: 26,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading3': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 21,
      lineHeight: 26,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading4': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 18,
      lineHeight: 22,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading5': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 18,
      lineHeight: 22,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-heading6': {
      fontName: 'TrebuchetMS',
      fontSize: 18,
      lineHeight: 22,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'default-pullquote': {
      fontName: 'TrebuchetMS-Bold',
      fontSize: 22,
      lineHeight: 28,
      textColor: PRIMARY_TEXT,
      conditional: [{ textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] }],
    },
    'footer-section': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      lineHeight: 23,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, lineHeight: 22, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'footer-section-first': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      lineHeight: 23,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, lineHeight: 22, conditions: [{ maxViewportWidth: 414 }] },
      ],
    },
    'footer-section-last': {
      fontName: 'Georgia',
      hyphenation: false,
      fontSize: 16,
      lineHeight: 23,
      textColor: PRIMARY_TEXT,
      conditional: [
        { textColor: DARK_TEXT, conditions: [{ preferredColorScheme: 'dark' }] },
        { fontSize: 15, lineHeight: 22, conditions: [{ maxViewportWidth: 414 }] },
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
    showTitleLayout:        { margin: { top: 20 } },
    headerLayout:           { margin: { top: 15, bottom: 8 } },
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
    bodyPhoto:      { margin: { top: 15, bottom: 15 } },
    bodyHeading:    { margin: { top: 10, bottom: 10 }, padding: { top: 10 } },
    bodyVideoEmbed: { margin: { top: 15, bottom: 15 } },
    bodyLayout: {
      padding: { left: 50, right: 50 },
      conditional: [{ padding: { right: 0, left: 0 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
    footerLayout: {
      padding: { top: 20, bottom: 20, left: 38, right: 38 },
      conditional: [{ padding: { right: 30, left: 30 }, conditions: [{ maxViewportWidth: 414 }] }],
    },
  },
};
