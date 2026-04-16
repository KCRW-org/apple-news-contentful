# apple-news-contentful

A Contentful app that publishes story entries to Apple News Publisher.
Modeled after [`npr-cds-contentful`](../npr-cds-contentful).

## Setup

### Prerequisites

- Node.js 20+
- A Contentful organization with app hosting enabled
- Apple News Publisher credentials (API Key ID, API Key Secret, Channel ID)

### First-time setup

```bash
# 1. Copy env file and fill in credentials
cp .env.example .env.development

# 2. Leave CONTENTFUL_APP_DEF_ID blank, then create your dev app definition:
npm run create-app-definition:dev
#    contentful-app-scripts writes the new ID to .env, NOT .env.development.
#    After this command:
#    a. Copy CONTENTFUL_APP_DEF_ID from .env into .env.development
#    b. Restore .env from .env.example (cp .env.example .env)

# 3. Build and upload
npm run build && npm run upload:dev

# 4. Register the App Action
npm run create-app-action:dev

# 5. Install the app in your space
npm run install-app:dev
```

### Content type requirements

Add a **JSON Object** field named `appleNewsData` (field ID: `appleNewsData`) to your Story content type. This is where the app stores the Apple News article ID, revision, share URL, and preview state. The field should be hidden from editors.

### Customization

**`src/lib/conventions.ts`** is the primary customization point. It contains all field name constants, types, and resolver functions. Edit this file to adapt the app to a different content model:

- `formatByline(people, date, categoryTitle)` — change byline formatting or date locale
- `resolveImage(fields, role)` — change how a linked photo entry maps to an image
- `resolveEntryUrl(entry, canonicalUrlTemplate)` — add `case` branches for other linkable content types
- `resolveMediaLink(fields)` — change how audio/video entries are identified
- `renderAfterBody(ctx)` — add or reorder trailing content (corrections, credits, etc.)

**`src/lib/kcrw.ts`** contains KCRW-specific private helpers and the ANF brand overrides. To adapt to a different brand, replace this file:

- `renderThumbnailUrl(image)` — maps KCRW's `focusHint` field to Contentful Images API crop params (`fit=pad` for `'nocrop'`, `fit=thumb&f=…` for a focal point). Delegates aspect-ratio clamping to `buildThumbnailUrl` in `utilities.ts`.
- `selectBylinePeople`, `renderCreditsComponent` — byline priority and credits block rendering
- `urlWithParent(entry)` — KCRW URL construction for Show and LandingPage parent paths
- `KCRW_OVERRIDES` — ANF brand fonts, colors, dark mode, layout

**`src/lib/utilities.ts`** contains generic helpers with no site-specific logic, including `buildThumbnailUrl` (ANF aspect-ratio clamping) and `IMAGE_TARGET_WIDTHS`.

For per-article style/layout overrides without code changes, use the **Article Customizations JSON** field in the Config screen — it is deep-merged over the generated ANF document.

## Usage

### Publishing to Apple News

The app can be placed in two Contentful locations: the **Entry Sidebar** and the **Entry Editor** tab. Both expose the same controls:

- **Publish to Apple News** — sends the article live to Apple News (visible to the public). Only available to users with Contentful **publish** permission on the entry.
- **Create News Preview** / **Update Preview** — sends the article as an Apple News preview, visible only to Apple News channel admins. Available to any user with **edit** permission. Useful for editorial review before going live.
- **Remove from Apple News** — deletes the article from Apple News and clears the stored state. Requires confirmation.

Publishing and previewing are independent actions — you don't need to preview before publishing. A preview can be promoted to live by clicking "Publish to Apple News".

After publishing or previewing, the UI displays the article's Apple News ID, revision, published date, and a share/preview URL.

### Article metadata options

The **Entry Editor** tab exposes per-publish metadata toggles:

- **Candidate to be featured** — marks the article as a candidate for Apple News editorial featuring.
- **Sponsored content** — flags the article as sponsored.

Entry-derived metadata (maturity rating, links, etc.) is resolved from the entry fields via `resolveArticleMetadata` in `conventions.ts`; the UI toggles override the resolved values for the current publish.

### Automatic cleanup on unpublish/archive

When an entry is **unpublished** or **archived** in Contentful, the app automatically deletes the corresponding Apple News article and clears the `appleNewsData` field via an App Event handler. This keeps Apple News in sync without manual intervention.

### Download Preview (offline)

The Entry Editor tab includes a **Download Preview** button that builds a `.news.zip` bundle for use with the [Apple News Preview](https://developer.apple.com/news-preview/) macOS app. This runs entirely in the browser using the Content Preview API (CPA) — no App Action round-trip required.

The bundle includes `article.json` and all referenced images, so it works offline. A CPA access token must be set in the app configuration to enable this feature.

### Preview an article (CLI)

```bash
npm run preview-article:dev -- <contentful-entry-id>
```

Prints the ANF JSON to stdout. Useful for debugging layout before publishing.

## Development

```bash
npm run dev          # Vite dev server (UI only, port 3000)
npm test             # Run tests
npm run type-check   # TypeScript check
npm run build        # Full build (frontend + functions)
```

## Architecture

See [`CLAUDE.md`](CLAUDE.md) for a full architectural overview.
