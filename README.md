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

Add a **JSON Object** field named `appleNewsData` (field ID: `appleNewsData`) to your Story content type. This is where the app stores the Apple News article ID, revision, and share URL. The field should be hidden from editors.

### Customization

All field names and content type IDs are in **`src/lib/conventions.ts`** — this is the only file you need to edit for a different content model. See the comments in that file for instructions.

To override how bylines, images, or internal links are resolved, override the exported resolver functions in `conventions.ts`:
- `buildByline(names, date)` — change byline formatting or date locale
- `resolveImage(entry)` — change how a linked entry maps to an image
- `resolveEntryUrl(entry, canonicalUrlTemplate)` — add `case` branches for other linkable content types

For style/layout/typography overrides, use the **Article Customizations JSON** field in the Config screen — it is deep-merged over the generated ANF document.

### Preview an article (without publishing)

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

See [`docs/superpowers/specs/2026-03-31-apple-news-contentful-app-design.md`](docs/superpowers/specs/2026-03-31-apple-news-contentful-app-design.md) for the full design spec.
