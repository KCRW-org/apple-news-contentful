# Apple News Contentful App — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Overview

A Contentful app that publishes story entries to Apple News Publisher via their API. Designed to be reusable across Contentful organizations (potentially open source), modeled after `npr-cds-contentful`. Field name conventions are configurable via a single `conventions.ts` module rather than runtime UI config, keeping the config screen lean while making customization straightforward.

---

## Project Structure

```
apple-news-contentful/
├── src/
│   ├── locations/
│   │   ├── ConfigScreen.tsx       # App installation config
│   │   └── EntrySidebar.tsx       # Per-entry publish/status/delete UI
│   ├── lib/
│   │   ├── api.ts                 # Apple News Publisher API client (HMAC signing, CRUD)
│   │   ├── article.ts             # Builds Apple News Format JSON from a ResolvedStory
│   │   ├── richText.ts            # Contentful Rich Text → ANF components
│   │   ├── fetch.ts               # Fetches & resolves entry data via Contentful CMA
│   │   └── conventions.ts         # ← PRIMARY CUSTOMIZATION POINT (field names, content type IDs)
│   └── types.ts                   # AppInstallationParameters + shared types
├── functions/
│   └── appleNews.ts               # App Action handler (publish/update/delete/checkStatus)
└── README.md                      # Setup guide + customization instructions
```

**Layer separation:** `api.ts` has no Contentful knowledge. `article.ts` has no API knowledge. `fetch.ts` bridges Contentful CMA → the `ResolvedStory` shape that `article.ts` consumes. Someone adapting this for a different schema primarily touches `conventions.ts` and `fetch.ts`.

---

## Configuration

### Config Screen Parameters (`AppInstallationParameters`)

Stored as Contentful app installation parameters.

| Parameter                   | Required | Description                                                                         |
| --------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `apiKeyId`                  | Yes      | Apple News API Key ID                                                               |
| `apiKeySecret`              | Yes      | Apple News API Key Secret                                                           |
| `channelId`                 | Yes      | Apple News Channel ID                                                               |
| `canonicalUrlTemplate`      | No       | URL template with `{slug}` and optional `{parentSlug}` placeholders                 |
| `locale`                    | No       | Contentful locale to read fields from. Default: `"en-US"`                           |
| `articleCustomizationsJson` | No       | JSON deep-merged over the generated article (styles, layouts, typography overrides) |
| `footerText`                | No       | Optional plain text appended as a footer component                                  |

### `conventions.ts` — The Customization Point

All content-model-specific names live here, co-located and documented:

```typescript
// conventions.ts
// ── Customize this file to match your Contentful content model ──

export const FIELD_NAMES = {
  title: 'title',
  slug: 'slug',
  body: 'body', // Contentful Rich Text field
  description: 'shortDescription', // Markdown, used as ANF excerpt
  image: 'primaryImage', // Linked entry following the image convention (see README)
  bylineCollections: ['hostsCollection', 'reportersCollection'],
  bylineCount: 'bylineCount',
  bylineDate: 'bylineDate', // Date string displayed in the byline
  corrections: 'corrections', // Markdown, rendered as a corrections section after the body
  audioMedia: 'audioMedia', // Linked entry for top-level audio player
  videoMedia: 'videoMedia', // Linked entry for top-level YouTube embed
  appleNewsData: 'appleNewsData', // Hidden JSON field for storing Apple News state
};

export const CONTENT_TYPE_IDS = {
  photo: 'photo', // Content type ID for linked image entries
  mediaLink: 'mediaLink', // Content type ID for embedded audio/video entries
  person: 'person', // Content type ID for byline person entries
};

// Sub-field conventions for linked image entries.
// Image entries must have: an `asset` field (Contentful Asset) with url/width/height,
// plus optional text fields for altText and caption/credit.
// Images are rendered in their original aspect ratio — no cropping is applied.
export const IMAGE_SUBFIELDS = {
  asset: 'asset',
  altText: 'altText',
  caption: 'photoCaption',
  credit: 'photoCredit',
};

// Sub-field conventions for person entries used in bylines.
// Person entries must expose a name text field.
export const PERSON_SUBFIELDS = {
  name: 'name',
};

// Sub-field conventions for mediaLink entries.
// `mediaUrl` holds either a YouTube or MP3 URL.
// `hosting` distinguishes the type: 'youtube' → video embed, 'soundstack' → audio player.
export const MEDIA_LINK_SUBFIELDS = {
  mediaUrl: 'mediaUrl',
  hosting: 'hosting', // 'youtube' | 'soundstack'
};

// ── Resolver functions ────────────────────────────────────────────────────────
// These functions contain org-specific logic for transforming fetched entry data
// into the shapes that article.ts expects. Override these when your content model
// differs from the defaults (e.g. different byline format, different person name field).

/**
 * Builds the byline string from person names and a date.
 * Override to change formatting, separators, or date display.
 */
export function buildByline(names: string[], date: string | null): string {
  const bylineParts: string[] = [];
  if (names.length > 0) {
    const joined =
      names.length === 1
        ? names[0]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    bylineParts.push('by ' + joined);
  }
  if (date) {
    bylineParts.push(
      new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    );
  }
  return bylineParts.join(' \uFF5C ');
}

/**
 * Extracts a ResolvedImage from a linked photo entry.
 * Override if your image entries have a different structure
 * (e.g. a direct Contentful asset link rather than a nested photo entry).
 */
export function resolveImage(
  entry: Record<string, unknown>,
): ResolvedImage | null {
  const asset = entry[IMAGE_SUBFIELDS.asset] as
    | Record<string, unknown>
    | undefined;
  if (!asset?.url) return null;
  return {
    url: asset.url as string,
    width: asset.width as number | undefined,
    height: asset.height as number | undefined,
    altText: entry[IMAGE_SUBFIELDS.altText] as string | undefined,
    caption: entry[IMAGE_SUBFIELDS.caption] as string | undefined,
    credit: entry[IMAGE_SUBFIELDS.credit] as string | undefined,
  };
}

/**
 * Resolves an internal entry hyperlink target to a canonical URL string,
 * or null if the entry type has no canonical URL (link will render as plain text).
 *
 * Override this to match your site's URL structure.
 * `entry` contains `__typename`, `slug`, and optionally `parentSlug`
 * (the slug of the first linked show, pre-resolved by fetch.ts for Story entries).
 *
 * The base URL (origin) is derived from `canonicalUrlTemplate` so that internal
 * links share the same domain as the article's own canonical URL.
 */
export function resolveEntryUrl(
  entry: { __typename: string; slug?: string; parentSlug?: string },
  canonicalUrlTemplate: string,
): string | null {
  if (!entry.slug) return null;
  const base = canonicalUrlTemplate ? new URL(canonicalUrlTemplate).origin : '';
  switch (entry.__typename) {
    case 'Story':
      // /shows/{showSlug}/stories/{slug} when a show is linked, otherwise /stories/{slug}
      return entry.parentSlug
        ? `${base}/shows/${entry.parentSlug}/stories/${entry.slug}`
        : `${base}/stories/${entry.slug}`;
    // Add cases for other linkable content types in your schema, e.g.:
    // case 'Show': return `${base}/shows/${entry.slug}`;
    default:
      return null;
  }
}
```

---

## Data Flow

### 1. Fetch Phase (`fetch.ts`)

The App Action receives an `entryId`, fetches the full entry via CMA, then resolves all linked entries:

- `primaryImage` → Photo entry → `ResolvedImage` (via `resolveImage()` from `conventions.ts`)
- `hostsCollection` + `reportersCollection` → Person entries → byline string (via `buildByline()` from `conventions.ts`, using up to `bylineCount` names + `bylineDate`)
- `audioMedia` → `ResolvedAudio | null`
- `videoMedia` → `ResolvedVideo | null`
- All embedded entries referenced in the Rich Text body → `Map<string, ResolvedEmbed>`
- All `INLINES.ENTRY_HYPERLINK` targets in the Rich Text body → `Map<string, string | null>` of resolved URLs (see Internal Hyperlink Resolution below)

Returns a flat, typed `ResolvedStory` — no Contentful SDK types leak past this layer.

#### Internal Hyperlink Resolution

`INLINES.ENTRY_HYPERLINK` nodes reference other Contentful entries by ID. Resolution is a two-step process in `fetch.ts`:

1. **Scan** the Rich Text document for all `INLINES.ENTRY_HYPERLINK` node IDs.
2. **Batch-fetch** each referenced entry via CMA, requesting only `__typename`, `slug`, and (for stories) `showsCollection { items { slug } }`.
3. **Resolve** each entry to a URL string using `resolveEntryUrl()` from `conventions.ts`, or `null` if unresolvable.

The resulting `Map<entryId, string | null>` is passed to `richText.ts`. When rendering an `ENTRY_HYPERLINK` node, if the map contains a non-null URL the link is rendered as an `<a href="...">` in the HTML body; otherwise the link text is rendered as plain text with the anchor stripped.

### 2. Build Phase (`article.ts` + `richText.ts`)

`article.ts` takes a `ResolvedStory` + config and produces a plain Apple News Format JSON object.

**Article component order:**

1. Header container: `title` → `intro` (shortDescription) → `byline` (names + `bylineDate`, formatted by `buildByline()` in `conventions.ts`)
2. Lead photo (with caption container if caption present; rendered at original aspect ratio, no cropping)
3. Top-level `audioMedia` → ANF `audio` component _(if present)_
4. Top-level `videoMedia` → ANF `embedwebvideo` component _(if present)_
5. Body section (rich text components)
6. Corrections section (markdown → plain text, rendered as a labeled `body` component) _(if `corrections` field has content)_
7. Footer _(if `footerText` configured)_

`richText.ts` walks Rich Text nodes:

| Rich Text node                                        | ANF output                                             |
| ----------------------------------------------------- | ------------------------------------------------------ |
| Paragraph, heading, list, quote, table                | `body` component, `format: "html"`                     |
| Embedded `photo` entry                                | `photo` component (external `https://` URL, no crop)   |
| Embedded `mediaLink` where `hosting === 'youtube'`    | `embedwebvideo` component with `bodyVideoEmbed` layout |
| Embedded `mediaLink` where `hosting === 'soundstack'` | `audio` component with `bodyAudioEmbed` layout         |
| `INLINES.ENTRY_HYPERLINK`                             | `<a href="...">` if resolved, else plain text          |
| All other embedded/inline entries                     | skipped                                                |

**Section anchors:** HTML body components are assigned sequential `id` attributes (`body-section-1`, `body-section-2`, …) matching the Plone pattern. Photo and media components that fall between two text sections receive an `anchor` property pointing to the adjacent section, enabling ANF's float/anchor layout. This mirrors the `before_anchor`/`after_anchor` logic in `kcrw.plone_apple_news/html.py`.

The `articleCustomizationsJson` config value is deep-merged over the completed article using recursive `mergedicts` logic (same algorithm as `kcrw.plone_apple_news`).

### 3. Publish Phase (`api.ts`)

Signs requests with HMAC-SHA256 (same algorithm as `kcrw.apple_news` Python package). The Apple News Publisher API always requires `multipart/form-data` — even with no bundled assets, `article.json` must be sent as a multipart part. Since all images use external `https://` URLs, only two parts are needed: optional `metadata` + `article.json`. On success, writes `{ id, revision, publishedAt, shareUrl }` back to the entry's `appleNewsData` field via CMA.

Updates always call `read_article` first to get the latest `revision` before sending (mirrors Plone's `refresh_revision`).

---

## Article Base Conventions

The article base mirrors `kcrw.plone_apple_news/templates.py` exactly. `generatorName` is updated to `"Apple News Contentful"`.

### Component Layouts

Carried forward from Plone: `headerLayout`, `titleLayout`, `subheadLayout`, `bylineLayout`, `leadPhoto`, `leadPhotoContainer`, `leadPhotoCaptionLayout`, `bodyLayout`, `bodyPhoto`, `bodyHeading`, `imageLeft`, `imageRight`, `captionLayout`, `bodyVideoEmbed`, `footerLayout`

New additions: `headerAudioLayout`, `headerVideoLayout`, `bodyAudioEmbed`

### Component Styles

Carried forward: `headerStyle`, `titleStyle`, `subheadStyle`, `bylineStyle`, `leadPhotoStyle`, `leadPhotoContainerStyle`, `leadPhotoCaptionStyle`, `bodyStyle`, `bodyHeadingStyle`, `bodyHeadingWithBorderStyle`, `bodyPhotoStyle`, `bodyPhotoInsetStyle`, `bodyPhotoContainerStyle`, `captionStyle`, `bodyImageStyle`, `bodyVideoEmbedStyle`, `footerStyle`

New additions: `headerAudioStyle`, `headerVideoStyle`, `bodyAudioEmbedStyle`

### Component Text Styles

`body-container`, `body-section`, `body-section-first`, `body-section-last`, `footer-section`, `footer-section-first`, `footer-section-last`

### HTML Body Constraints

Allowed tags: `p`, `br`, `ul`, `ol`, `li`, `blockquote`, `a`, `strong`, `b`, `em`, `i`, `sup`, `sub`, `del`, `s`, `pre`, `code`, `samp`, `span`, `div`

Allowed attributes: `id`, `href`, `data-anf-textstyle`

All other tags/attributes stripped before passing to ANF body components.

---

## Sidebar UI & State Management

### `appleNewsData` Field Schema

```json
{
  "id": "abc123",
  "revision": "AAAAAAAAAAAAAAAAAAAAAA==",
  "publishedAt": "2026-03-31T12:00:00Z",
  "shareUrl": "https://apple.news/..."
}
```

Stored as a hidden JSON field on the story content type. Must be added to the content type before the app can publish. If missing, the App Action returns a clear error message directing the editor to add the field.

### Sidebar States

| State                             | UI                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Checking status                   | Spinner + "Checking Apple News status…"                                          |
| Not published                     | "Publish to Apple News" button                                                   |
| Published                         | "Update in Apple News" button + share URL link + "Remove from Apple News" button |
| Entry not published in Contentful | Warning note, publish button disabled                                            |
| Loading                           | Spinner in active button                                                         |
| Error                             | Negative `Note` with error message                                               |

### App Actions

- `publishToAppleNews` — creates or updates based on presence of `appleNewsData.id`; always refreshes revision before updating
- `deleteFromAppleNews` — deletes from Apple News Publisher, clears `appleNewsData` field; delete button requires confirmation step
- `checkStatus` — reads `appleNewsData` field, returns `{ published: boolean, shareUrl?: string }`

---

## Error Handling

All App Action handlers return `{ success: false, error: string }` rather than throwing — the sidebar always receives a displayable message.

Specific cases:

- **Revision conflict (409)** — retry once after a fresh `read_article` to get the latest revision
- **Entry not published in Contentful** — sidebar guards the publish button before the App Action is called
- **Missing required config** — App Action returns early with a message pointing to the config screen
- **`appleNewsData` field missing from content type** — caught on first write, returns actionable error message

---

## Testing

- **`article.ts`** — unit tests: given a `ResolvedStory`, assert ANF output structure
- **`richText.ts`** — unit tests per node type; edge cases: empty body, unsupported embeds, first/last body section text style assignment
- **`api.ts`** — unit tests: assert HMAC signature generation correctness
- **`fetch.ts`** — unit tests: mock CMA, assert `ResolvedStory` shape

---

## Customization Guide

To adapt the app for a different Contentful schema:

1. **Edit `conventions.ts`** — the primary customization point. Update `FIELD_NAMES`, `CONTENT_TYPE_IDS`, and sub-field maps for your content model. For logic-heavy customizations, override the exported resolver functions:
   - `buildByline(names, date)` — change byline formatting, date locale, separator style
   - `resolveImage(entry)` — change how a linked entry is mapped to a `ResolvedImage` (e.g. if you use a direct Contentful asset instead of a linked photo entry)
   - `resolveEntryUrl(entry, canonicalUrlTemplate)` — add `case` branches for each linkable content type in your schema; the default only handles `Story`
2. **Edit `fetch.ts`** — if you need to fetch additional linked fields not covered by the defaults, add resolvers here. Each resolver is a small, isolated function with a clear input/output contract.
3. **Edit `article.ts`** — if you need to add, remove, or reorder top-level article components, the `buildArticleComponents` function is the right place.
4. **Use `articleCustomizationsJson`** — for style/layout/typography overrides, prefer the deep-merge config over editing code directly.

All files are documented with JSDoc comments explaining the expected input shape and what to change.
