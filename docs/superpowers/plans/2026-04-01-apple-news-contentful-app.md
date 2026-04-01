# Apple News Contentful App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Contentful sidebar app that publishes story entries to Apple News Publisher, modeled after `npr-cds-contentful`, with all field-name customizations centralized in `src/lib/conventions.ts`.

**Architecture:** A Vite + React Contentful app with two locations (ConfigScreen + EntrySidebar) and a serverless function backend. The function handles all App Action calls (publish/update/delete/checkStatus). The `conventions.ts` module is the single customization point for content model differences; `fetch.ts` resolves Contentful entries to a flat `ResolvedStory` shape; `article.ts` converts that to ANF JSON; `api.ts` signs and sends requests to Apple News Publisher.

**Tech Stack:** TypeScript 5, React 18, Vite 5, Vitest 2, `@contentful/app-sdk`, `@contentful/app-scripts`, `@contentful/node-apps-toolkit`, `contentful-management`, `@contentful/rich-text-types`, `@contentful/rich-text-html-renderer`, Node.js `node:crypto` for HMAC signing.

**Reference repos (read-only):**
- `../npr-cds-contentful/` — exact scaffold to mirror
- `../kcrw_plone/src/kcrw.plone_apple_news/src/kcrw/plone_apple_news/templates.py` — article base conventions
- `../apple-news/kcrw.apple_news/src/kcrw/apple_news/api.py` — HMAC signing algorithm

---

## File Structure

```
apple-news-contentful/
├── src/
│   ├── App.tsx                         # Routes to ConfigScreen or EntrySidebar by sdk.location
│   ├── index.tsx                       # React entry point
│   ├── react-app-env.d.ts              # CRA type reference shim
│   ├── types.ts                        # All shared TypeScript types
│   ├── lib/
│   │   ├── api.ts                      # Apple News Publisher API: HMAC signing, CRUD
│   │   ├── article.ts                  # Build ANF document from ResolvedStory
│   │   ├── conventions.ts              # ← PRIMARY CUSTOMIZATION POINT
│   │   ├── fetch.ts                    # Contentful CMA → ResolvedStory
│   │   └── richText.ts                 # Contentful Rich Text → ANF components array
│   └── locations/
│       ├── ConfigScreen.tsx            # App installation config UI
│       └── EntrySidebar.tsx            # Publish/update/delete sidebar
├── src/lib/__tests__/
│   ├── api.test.ts
│   ├── article.test.ts
│   ├── fetch.test.ts
│   └── richText.test.ts
├── src/tools/
│   ├── imports.ts                      # Shared env + manifest loading for tools
│   ├── create-app-action.ts            # Registers the App Action in Contentful
│   └── preview-article.ts             # Prints ANF JSON for an entry without publishing
├── functions/
│   ├── index.ts                        # Function entry point, routes to handlers
│   ├── appleNews.ts                    # All App Action handlers
│   └── types.ts                        # Function event handler types
├── docs/
│   └── superpowers/
│       ├── specs/2026-03-31-apple-news-contentful-app-design.md
│       └── plans/2026-04-01-apple-news-contentful-app.md
├── .env.example
├── .gitignore
├── contentful-app-manifest.json
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/index.tsx`
- Create: `src/App.tsx`
- Create: `src/react-app-env.d.ts`
- Create: `contentful-app-manifest.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "apple-news-contentful",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@contentful/app-sdk": "^4.22.0",
    "@contentful/f36-components": "4.45.0",
    "@contentful/f36-tokens": "4.0.2",
    "@contentful/react-apps-toolkit": "1.2.16",
    "@contentful/rich-text-html-renderer": "^17.1.6",
    "@contentful/rich-text-types": "^17.1.6",
    "contentful-management": "^11.27.0",
    "emotion": "10.0.27",
    "react": "18.2.0",
    "react-dom": "18.2.0"
  },
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "build": "vite build && npm run build:functions",
    "build:functions": "contentful-app-scripts build-functions --ci",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "create-app-definition": "contentful-app-scripts create-app-definition",
    "create-app-definition:dev": "dotenv -e .env.development -- contentful-app-scripts create-app-definition",
    "upload": "contentful-app-scripts upload --bundle-dir ./build",
    "upload:dev": "dotenv -e .env.development -- contentful-app-scripts upload --bundle-dir ./build",
    "upload-ci": "contentful-app-scripts upload --ci --host api.contentful.com --bundle-dir ./build --organization-id $CONTENTFUL_ORG_ID --definition-id $CONTENTFUL_APP_DEF_ID --token $CONTENTFUL_ACCESS_TOKEN",
    "install-app": "contentful-app-scripts install",
    "install-app:dev": "dotenv -e .env.development -- contentful-app-scripts install",
    "create-app-action": "CONTENTFUL_HOST=api.contentful.com tsx -r dotenv/config ./src/tools/create-app-action.ts",
    "create-app-action:dev": "dotenv -e .env.development -- cross-env CONTENTFUL_HOST=api.contentful.com tsx ./src/tools/create-app-action.ts",
    "preview-article": "tsx -r dotenv/config ./src/tools/preview-article.ts",
    "preview-article:dev": "dotenv -e .env.development -- tsx ./src/tools/preview-article.ts",
    "prepare": "husky"
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  },
  "devDependencies": {
    "@contentful/app-scripts": "^2.3.0",
    "@contentful/node-apps-toolkit": "^3.13.0",
    "@tsconfig/create-react-app": "2.0.0",
    "@tsconfig/recommended": "^1.0.3",
    "@types/node": "^22.13.10",
    "@types/react": "18.2.14",
    "@types/react-dom": "18.2.6",
    "@vitejs/plugin-react": "^4.3.4",
    "cross-env": "7.0.3",
    "dotenv": "^16.4.7",
    "dotenv-cli": "^11.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^15.5.1",
    "prettier": "3.2.5",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "vitest": "^2.1.8"
  },
  "homepage": "."
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "@tsconfig/create-react-app/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["dom", "dom.iterable", "esnext"]
  },
  "include": ["src", "functions"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Apple News Contentful App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `contentful-app-manifest.json`**

```json
{
  "id": "apple-news-contentful",
  "name": "Apple News Publisher",
  "functions": [
    {
      "id": "appleNewsFunction",
      "name": "Apple News Function",
      "description": "Handles publish/update/delete/status for Apple News Publisher",
      "path": "functions/index.ts",
      "allowNetworks": ["https://news-api.apple.com"],
      "accepts": ["appaction.call"]
    }
  ]
}
```

- [ ] **Step 6: Create `src/react-app-env.d.ts`**

```typescript
/// <reference types="react-scripts" />
```

- [ ] **Step 7: Create `src/index.tsx`**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalStyles } from '@contentful/f36-components';
import { SDKProvider } from '@contentful/react-apps-toolkit';
import App from './App';

const container = document.getElementById('root')!;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <GlobalStyles />
    <SDKProvider>
      <App />
    </SDKProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 8: Create `src/App.tsx`**

```typescript
import React, { useMemo } from 'react';
import { locations } from '@contentful/app-sdk';
import ConfigScreen from './locations/ConfigScreen';
import EntrySidebar from './locations/EntrySidebar';
import { useSDK } from '@contentful/react-apps-toolkit';

const ComponentLocationSettings = {
  [locations.LOCATION_APP_CONFIG]: ConfigScreen,
  [locations.LOCATION_ENTRY_SIDEBAR]: EntrySidebar,
};

const App = () => {
  const sdk = useSDK();
  const Component = useMemo(() => {
    for (const [location, component] of Object.entries(ComponentLocationSettings)) {
      if (sdk.location.is(location)) return component;
    }
  }, [sdk.location]);
  return Component ? <Component /> : null;
};

export default App;
```

- [ ] **Step 9: Create `.gitignore`**

```
node_modules/
build/
dist/
.env
.env.development
.env.production
*.local
```

- [ ] **Step 10: Create `.env.example`**

```
CONTENTFUL_ACCESS_TOKEN=
CONTENTFUL_ORG_ID=
CONTENTFUL_APP_DEF_ID=
CONTENTFUL_SPACE_ID=
CONTENTFUL_ENVIRONMENT_ID=master
```

- [ ] **Step 11: Install dependencies**

Run: `cd /Users/alecmitchell/Development/bundles/kcrw/apple-news-contentful && npm install`
Expected: No errors; `node_modules/` created.

- [ ] **Step 12: Verify build compiles (stub locations first)**

Create two temporary stub files so the build doesn't error on missing imports:

`src/locations/ConfigScreen.tsx`:
```typescript
import React from 'react';
const ConfigScreen = () => <div>Config</div>;
export default ConfigScreen;
```

`src/locations/EntrySidebar.tsx`:
```typescript
import React from 'react';
const EntrySidebar = () => <div>Sidebar</div>;
export default EntrySidebar;
```

Run: `npm run type-check`
Expected: No TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git init
git add .
git commit -m "chore: initial project scaffold"
```

---

## Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
// App configuration stored in Contentful installation parameters
export type AppInstallationParameters = {
  apiKeyId?: string;
  apiKeySecret?: string;
  channelId?: string;
  canonicalUrlTemplate?: string;
  locale?: string;
  articleCustomizationsJson?: string;
  footerText?: string;
};

// Stored as JSON in the entry's appleNewsData field
export type AppleNewsData = {
  id: string;
  revision: string;
  publishedAt: string;
  shareUrl: string;
};

// App Action result types (returned from functions/appleNews.ts)
export type PublishActionResult = {
  success: boolean;
  shareUrl?: string;
  error?: string;
};

export type CheckStatusResult = {
  published: boolean;
  shareUrl?: string;
};

export type DeleteActionResult = {
  success: boolean;
  error?: string;
};

// Resolved content shapes — no Contentful SDK types leak past fetch.ts
export type ResolvedImage = {
  url: string;
  width?: number;
  height?: number;
  altText?: string;
  caption?: string;
  credit?: string;
};

export type ResolvedAudio = {
  url: string;
};

export type ResolvedVideo = {
  url: string; // YouTube URL
};

export type ResolvedMediaLink =
  | { type: 'youtube'; url: string }
  | { type: 'soundstack'; url: string };

export type ResolvedEmbed =
  | ({ type: 'photo' } & ResolvedImage)
  | ({ type: 'mediaLink' } & ResolvedMediaLink);

export type ResolvedStory = {
  title: string;
  description: string | null;  // shortDescription field
  byline: string | null;       // formatted via conventions.buildByline()
  leadImage: ResolvedImage | null;
  audio: ResolvedAudio | null;
  video: ResolvedVideo | null;
  body: import('@contentful/rich-text-types').Document | null;
  corrections: string | null;  // markdown text
  embedMap: Map<string, ResolvedEmbed>;    // entryId → resolved embed
  linkMap: Map<string, string | null>;     // entryId → canonical URL or null
};

// ANF document type (loosely typed — ANF has many component shapes)
export type AnfComponent = Record<string, unknown>;

export type AnfDocument = {
  version: string;
  identifier: string;
  title: string;
  language: string;
  layout: Record<string, unknown>;
  components: AnfComponent[];
  documentStyle: Record<string, unknown>;
  textStyles: Record<string, unknown>;
  componentTextStyles: Record<string, unknown>;
  componentStyles: Record<string, unknown>;
  componentLayouts: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: conventions.ts

**Files:**
- Create: `src/lib/conventions.ts`

This is the primary customization file. Engineers adapting this for a different content model touch only this file and (if needed) `fetch.ts`.

- [ ] **Step 1: Create `src/lib/conventions.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/conventions.ts
git commit -m "feat: add conventions.ts customization point"
```

---

## Task 4: api.ts — Apple News Publisher API Client

`api.ts` knows nothing about Contentful. It takes credentials + article data and makes signed Apple News Publisher API calls.

The HMAC algorithm (from `kcrw.apple_news/api.py`):
- `key_bytes = base64_decode(api_key_secret)`
- `canonical = method + url + date` (append `content_type + body_str` when POST)
- `signature = base64_encode(hmac_sha256(key_bytes, canonical_utf8))`
- `Authorization: HHMAC; key={key_id}; signature={signature}; date={date}`

The Apple News Publisher API always uses `multipart/form-data`, even for requests with no bundled assets.

**Files:**
- Create: `src/lib/__tests__/api.test.ts`
- Create: `src/lib/api.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/api.test.ts
import { describe, it, expect } from 'vitest';
import { createSignature, buildMultipartBody } from '../api';

describe('createSignature', () => {
  it('produces a deterministic HHMAC Authorization header', () => {
    // key_secret = base64("testsecret") = "dGVzdHNlY3JldA=="
    const auth = createSignature(
      'GET',
      'https://news-api.apple.com/channels/abc123',
      '2021-01-01T00:00:00Z',
      'mykeyid',
      'dGVzdHNlY3JldA==',
    );
    expect(auth).toMatch(
      /^HHMAC; key=mykeyid; signature=[A-Za-z0-9+/]+=*; date=2021-01-01T00:00:00Z$/,
    );
    // Same inputs → same output
    const auth2 = createSignature(
      'GET',
      'https://news-api.apple.com/channels/abc123',
      '2021-01-01T00:00:00Z',
      'mykeyid',
      'dGVzdHNlY3JldA==',
    );
    expect(auth).toBe(auth2);
  });

  it('produces a different signature for different methods', () => {
    const get = createSignature('GET', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    const post = createSignature('POST', 'https://news-api.apple.com/channels/abc', '2021-01-01T00:00:00Z', 'k', 'dGVzdA==');
    expect(get).not.toBe(post);
  });

  it('includes content-type and body in the signed canonical when provided', () => {
    const withBody = createSignature(
      'POST',
      'https://news-api.apple.com/channels/abc/articles',
      '2021-01-01T00:00:00Z',
      'k',
      'dGVzdA==',
      'multipart/form-data; boundary=abc',
      'body-content',
    );
    const withoutBody = createSignature(
      'POST',
      'https://news-api.apple.com/channels/abc/articles',
      '2021-01-01T00:00:00Z',
      'k',
      'dGVzdA==',
    );
    expect(withBody).not.toBe(withoutBody);
  });
});

describe('buildMultipartBody', () => {
  it('builds a multipart body with correct content-type boundary', () => {
    const { body, contentType } = buildMultipartBody([
      { name: 'article.json', data: '{"version":"1.7"}', mimeType: 'application/json' },
    ]);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=.+$/);
    const boundary = contentType.split('boundary=')[1];
    const bodyText = body.toString('utf8');
    expect(bodyText).toContain(`--${boundary}`);
    expect(bodyText).toContain('Content-Type: application/json');
    expect(bodyText).toContain('filename=article.json');
    expect(bodyText).toContain('{"version":"1.7"}');
    expect(bodyText).toContain(`--${boundary}--`);
  });

  it('includes metadata part before article.json when metadata is provided', () => {
    const { body } = buildMultipartBody([
      { name: 'metadata', data: '{"data":{}}', mimeType: 'application/json' },
      { name: 'article.json', data: '{"version":"1.7"}', mimeType: 'application/json' },
    ]);
    const bodyText = body.toString('utf8');
    const metaIdx = bodyText.indexOf('filename=metadata');
    const articleIdx = bodyText.indexOf('filename=article.json');
    expect(metaIdx).toBeLessThan(articleIdx);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test`
Expected: FAIL — `createSignature` and `buildMultipartBody` not found.

- [ ] **Step 3: Implement `src/lib/api.ts`**

```typescript
import { createHmac } from 'node:crypto';

const APPLE_NEWS_BASE_URL = 'https://news-api.apple.com';

export type ApiCredentials = {
  apiKeyId: string;
  apiKeySecret: string;
  channelId: string;
};

export type AppleNewsArticleData = {
  id: string;
  revision: string;
  shareUrl: string;
  publishedAt?: string;
};

/**
 * Builds the HHMAC Authorization header value.
 * Exported for testing. Canonical string = method + url + date [+ contentType + bodyStr].
 */
export function createSignature(
  method: string,
  url: string,
  date: string,
  apiKeyId: string,
  apiKeySecret: string,
  contentType?: string,
  bodyStr?: string,
): string {
  const keyBytes = Buffer.from(apiKeySecret, 'base64');
  let canonical = method + url + date;
  if (contentType && bodyStr !== undefined) {
    canonical += contentType + bodyStr;
  }
  const signature = createHmac('sha256', keyBytes)
    .update(canonical, 'utf8')
    .digest('base64');
  return `HHMAC; key=${apiKeyId}; signature=${signature}; date=${date}`;
}

export type MultipartPart = {
  name: string;
  data: string;
  mimeType: string;
};

/**
 * Builds a multipart/form-data body.
 * Returns the raw Buffer and the Content-Type header value (including boundary).
 * Exported for testing.
 */
export function buildMultipartBody(parts: MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const dataBytes = Buffer.from(part.data, 'utf8');
    const header = [
      `--${boundary}`,
      `Content-Type: ${part.mimeType}`,
      `Content-Disposition: form-data; filename=${part.name}; size=${dataBytes.length}`,
      '',
      '',
    ].join('\r\n');
    chunks.push(Buffer.from(header, 'utf8'));
    chunks.push(dataBytes);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--`, 'utf8'));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function appleNewsRequest(
  method: string,
  path: string,
  credentials: ApiCredentials,
  bodyParts?: MultipartPart[],
): Promise<unknown> {
  const url = `${APPLE_NEWS_BASE_URL}/${path}`;
  const date = nowIso();

  let fetchInit: RequestInit;
  if (bodyParts) {
    const { body, contentType } = buildMultipartBody(bodyParts);
    const bodyStr = body.toString('utf8');
    const authorization = createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret, contentType, bodyStr);
    fetchInit = {
      method,
      headers: { Authorization: authorization, 'Content-Type': contentType },
      body,
    };
  } else {
    const authorization = createSignature(method, url, date, credentials.apiKeyId, credentials.apiKeySecret);
    fetchInit = { method, headers: { Authorization: authorization } };
  }

  const resp = await fetch(url, fetchInit);
  if (method === 'DELETE') {
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.json().catch(() => null);
      throw new Error(`Apple News DELETE returned ${resp.status}: ${JSON.stringify(body)}`);
    }
    return null;
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(`Apple News ${method} ${path} returned ${resp.status}: ${JSON.stringify(body)}`);
  }
  return resp.json();
}

/** Creates a new article in Apple News. Returns the article data including id, revision, shareUrl. */
export async function createArticle(
  articleJson: unknown,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const parts: MultipartPart[] = [
    { name: 'article.json', data: JSON.stringify(articleJson), mimeType: 'application/json' },
  ];
  const resp = (await appleNewsRequest('POST', `channels/${credentials.channelId}/articles`, credentials, parts)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Reads an existing article to get the latest revision. */
export async function readArticle(
  articleId: string,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const resp = (await appleNewsRequest('GET', `articles/${articleId}`, credentials)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Updates an existing article. Requires the current revision (obtained via readArticle). */
export async function updateArticle(
  articleId: string,
  revision: string,
  articleJson: unknown,
  credentials: ApiCredentials,
): Promise<AppleNewsArticleData> {
  const metadata = { data: { revision } };
  const parts: MultipartPart[] = [
    { name: 'metadata', data: JSON.stringify(metadata), mimeType: 'application/json' },
    { name: 'article.json', data: JSON.stringify(articleJson), mimeType: 'application/json' },
  ];
  const resp = (await appleNewsRequest('POST', `articles/${articleId}`, credentials, parts)) as { data: AppleNewsArticleData };
  return resp.data;
}

/** Deletes an article. Does not throw on 404. */
export async function deleteArticle(
  articleId: string,
  credentials: ApiCredentials,
): Promise<void> {
  await appleNewsRequest('DELETE', `articles/${articleId}`, credentials);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: All 4 `api.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/__tests__/api.test.ts
git commit -m "feat: add Apple News API client with HMAC signing"
```

---

## Task 5: fetch.ts — Contentful CMA → ResolvedStory

`fetch.ts` knows about Contentful CMA and `conventions.ts`. It resolves linked entries and rich text references, then returns a flat `ResolvedStory`.

**Files:**
- Create: `src/lib/__tests__/fetch.test.ts`
- Create: `src/lib/fetch.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/fetch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolveStory } from '../fetch';
import type { AppInstallationParameters } from '../../types';

const makeCma = (entryFields: Record<string, unknown>) => ({
  entry: {
    get: vi.fn().mockResolvedValue({
      fields: Object.fromEntries(
        Object.entries(entryFields).map(([k, v]) => [k, { 'en-US': v }])
      ),
    }),
  },
});

const baseParams: AppInstallationParameters = {
  locale: 'en-US',
  canonicalUrlTemplate: 'https://www.example.org/stories/{slug}',
};

describe('resolveStory', () => {
  it('extracts title and description', async () => {
    const cma = makeCma({
      title: 'My Story',
      shortDescription: 'A great story',
    }) as any;
    const story = await resolveStory('entry1', baseParams, {
      cma,
      spaceId: 'space1',
      environmentId: 'master',
    });
    expect(story.title).toBe('My Story');
    expect(story.description).toBe('A great story');
  });

  it('returns null description when field is absent', async () => {
    const cma = makeCma({ title: 'Title' }) as any;
    const story = await resolveStory('entry1', baseParams, {
      cma,
      spaceId: 's',
      environmentId: 'e',
    });
    expect(story.description).toBeNull();
  });

  it('fetches linked photo entry to resolve leadImage', async () => {
    const cma = {
      entry: {
        get: vi.fn()
          .mockResolvedValueOnce({
            // story entry
            fields: {
              title: { 'en-US': 'Title' },
              primaryImage: { 'en-US': { sys: { id: 'photo1', linkType: 'Entry' } } },
            },
          })
          .mockResolvedValueOnce({
            // photo entry
            fields: {
              asset: { 'en-US': { url: 'https://img.example.com/photo.jpg', width: 800, height: 600 } },
              altText: { 'en-US': 'Alt text' },
            },
          }),
      },
    } as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.leadImage).toEqual({
      url: 'https://img.example.com/photo.jpg',
      width: 800,
      height: 600,
      altText: 'Alt text',
      caption: undefined,
      credit: undefined,
    });
  });

  it('resolves corrections field', async () => {
    const cma = makeCma({ title: 'T', corrections: 'A correction was made.' }) as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.corrections).toBe('A correction was made.');
  });

  it('returns empty embedMap and linkMap when body is null', async () => {
    const cma = makeCma({ title: 'T' }) as any;
    const story = await resolveStory('entry1', baseParams, { cma, spaceId: 's', environmentId: 'e' });
    expect(story.embedMap.size).toBe(0);
    expect(story.linkMap.size).toBe(0);
    expect(story.body).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test`
Expected: FAIL — `resolveStory` not found.

- [ ] **Step 3: Implement `src/lib/fetch.ts`**

```typescript
import type { PlainClientAPI } from 'contentful-management';
import type { Document } from '@contentful/rich-text-types';
import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type { AppInstallationParameters, ResolvedStory, ResolvedEmbed, ResolvedImage, ResolvedAudio, ResolvedVideo } from '../types';
import {
  FIELD_NAMES,
  CONTENT_TYPE_IDS,
  IMAGE_SUBFIELDS,
  PERSON_SUBFIELDS,
  MEDIA_LINK_SUBFIELDS,
  buildByline,
  resolveImage,
  resolveEntryUrl,
} from './conventions';

export type CmaContext = {
  cma: PlainClientAPI;
  spaceId: string;
  environmentId: string;
};

/** Resolves a Contentful story entry to a flat ResolvedStory shape. */
export async function resolveStory(
  entryId: string,
  params: AppInstallationParameters,
  ctx: CmaContext,
): Promise<ResolvedStory> {
  const locale = params.locale ?? 'en-US';
  const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId });
  const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;

  const get = <T>(fieldName: string): T | undefined =>
    fields[fieldName]?.[locale] as T | undefined;

  const title = (get<string>(FIELD_NAMES.title) ?? '').trim();
  const description = get<string>(FIELD_NAMES.description) ?? null;
  const corrections = get<string>(FIELD_NAMES.corrections) ?? null;
  const bylineDate = get<string>(FIELD_NAMES.bylineDate) ?? null;
  const bylineCount = get<number>(FIELD_NAMES.bylineCount) ?? 3;
  const body = get<Document>(FIELD_NAMES.body) ?? null;

  // Resolve all async dependencies in parallel
  const imageLink = get<{ sys: { id: string } }>(FIELD_NAMES.image);
  const audioLink = get<{ sys: { id: string } }>(FIELD_NAMES.audioMedia);
  const videoLink = get<{ sys: { id: string } }>(FIELD_NAMES.videoMedia);

  // Collect embedded entry IDs and hyperlink IDs from body
  const embeddedIds = body ? collectEmbeddedEntryIds(body) : [];
  const hyperlinkIds = body ? collectEntryHyperlinkIds(body) : [];

  const embedMap = new Map<string, ResolvedEmbed>();
  const linkMap = new Map<string, string | null>();

  const [personNames, leadImage, audio, video] = await Promise.all([
    resolveBylineNames(fields, locale, bylineCount, ctx),
    imageLink ? resolveImageEntry(imageLink.sys.id, locale, ctx) : Promise.resolve(null),
    audioLink ? resolveAudioEntry(audioLink.sys.id, locale, ctx) : Promise.resolve(null),
    videoLink ? resolveVideoEntry(videoLink.sys.id, locale, ctx) : Promise.resolve(null),
    ...embeddedIds.map(id => resolveBodyEmbed(id, locale, ctx, embedMap)),
    ...hyperlinkIds.map(id => resolveHyperlink(id, ctx, linkMap, params.canonicalUrlTemplate ?? '')),
  ]);

  const byline =
    personNames.length > 0 || bylineDate ? buildByline(personNames, bylineDate) : null;

  return { title, description, byline, leadImage, audio, video, body, corrections, embedMap, linkMap };
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function resolveBylineNames(
  fields: Record<string, Record<string, unknown>>,
  locale: string,
  maxCount: number,
  ctx: CmaContext,
): Promise<string[]> {
  const names: string[] = [];
  for (const collectionField of FIELD_NAMES.bylineCollections) {
    const items = (fields[collectionField]?.[locale] as { items?: { sys: { id: string } }[] } | undefined)?.items ?? [];
    for (const link of items) {
      if (names.length >= maxCount) break;
      try {
        const personEntry = await ctx.cma.entry.get({
          spaceId: ctx.spaceId,
          environmentId: ctx.environmentId,
          entryId: link.sys.id,
        });
        const personFields = (personEntry.fields ?? {}) as Record<string, Record<string, unknown>>;
        const name = personFields[PERSON_SUBFIELDS.name]?.[locale] as string | undefined;
        if (name) names.push(name);
      } catch {
        // skip unresolvable persons
      }
    }
    if (names.length >= maxCount) break;
  }
  return names;
}

async function resolveImageEntry(
  id: string,
  locale: string,
  ctx: CmaContext,
): Promise<ResolvedImage | null> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const fields = Object.fromEntries(
      Object.entries(rawFields).map(([k, v]) => [k, v[locale]])
    );
    // Resolve nested asset link if it exists
    const assetLink = fields[IMAGE_SUBFIELDS.asset] as { sys: { id: string }; url?: string } | undefined;
    if (assetLink && !assetLink.url && assetLink.sys?.id) {
      // asset is a link, not inlined — not expected from CMA entry.get but handle gracefully
      return null;
    }
    return resolveImage(fields);
  } catch {
    return null;
  }
}

async function resolveAudioEntry(
  id: string,
  locale: string,
  ctx: CmaContext,
): Promise<ResolvedAudio | null> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const url = rawFields['mediaUrl']?.[locale] as string | undefined;
    return url ? { url } : null;
  } catch {
    return null;
  }
}

async function resolveVideoEntry(
  id: string,
  locale: string,
  ctx: CmaContext,
): Promise<ResolvedVideo | null> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const url = rawFields['mediaUrl']?.[locale] as string | undefined;
    return url ? { url } : null;
  } catch {
    return null;
  }
}

async function resolveBodyEmbed(
  id: string,
  locale: string,
  ctx: CmaContext,
  embedMap: Map<string, ResolvedEmbed>,
): Promise<void> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const contentTypeId = (entry.sys as { contentType?: { sys?: { id?: string } } }).contentType?.sys?.id;
    const fields = Object.fromEntries(
      Object.entries(rawFields).map(([k, v]) => [k, v[locale]])
    );

    if (contentTypeId === CONTENT_TYPE_IDS.photo) {
      const image = resolveImage(fields);
      if (image) embedMap.set(id, { type: 'photo', ...image });
    } else if (contentTypeId === CONTENT_TYPE_IDS.mediaLink) {
      const url = fields[MEDIA_LINK_SUBFIELDS.mediaUrl] as string | undefined;
      const hosting = fields[MEDIA_LINK_SUBFIELDS.hosting] as string | undefined;
      if (url && hosting === 'youtube') {
        embedMap.set(id, { type: 'mediaLink', type: 'youtube', url } as any);
      } else if (url && hosting === 'soundstack') {
        embedMap.set(id, { type: 'mediaLink', type: 'soundstack', url } as any);
      }
    }
  } catch {
    // skip unresolvable embeds
  }
}

async function resolveHyperlink(
  id: string,
  ctx: CmaContext,
  linkMap: Map<string, string | null>,
  canonicalUrlTemplate: string,
): Promise<void> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const locale = 'en-US';
    const __typename = (entry.sys as { contentType?: { sys?: { id?: string } } }).contentType?.sys?.id ?? '';
    const slug = rawFields['slug']?.[locale] as string | undefined;
    const showsCollection = rawFields['showsCollection']?.[locale] as { items?: { fields?: Record<string, Record<string, unknown>> }[] } | undefined;
    const parentSlug = showsCollection?.items?.[0]?.fields?.['slug']?.['en-US'] as string | undefined;
    const url = resolveEntryUrl({ __typename, slug, parentSlug }, canonicalUrlTemplate);
    linkMap.set(id, url);
  } catch {
    linkMap.set(id, null);
  }
}

/** Collects entry IDs of all top-level BLOCKS.EMBEDDED_ENTRY nodes in a rich text document. */
export function collectEmbeddedEntryIds(doc: Document): string[] {
  return doc.content
    .filter(node => node.nodeType === BLOCKS.EMBEDDED_ENTRY)
    .map(node => (node as any).data.target.sys.id as string);
}

/** Recursively collects entry IDs of all INLINES.ENTRY_HYPERLINK nodes in a rich text document. */
export function collectEntryHyperlinkIds(doc: Document): string[] {
  const ids: string[] = [];
  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      const n = node as { nodeType?: string; data?: { target?: { sys?: { id?: string } } }; content?: unknown[] };
      if (n.nodeType === INLINES.ENTRY_HYPERLINK && n.data?.target?.sys?.id) {
        ids.push(n.data.target.sys.id);
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  }
  walk(doc.content as unknown[]);
  return [...new Set(ids)]; // deduplicate
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: All 5 `fetch.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetch.ts src/lib/__tests__/fetch.test.ts
git commit -m "feat: add fetch.ts — CMA to ResolvedStory resolver"
```

---

## Task 6: richText.ts — Rich Text → ANF Components

Converts a Contentful `Document` into an array of ANF components. Consecutive text blocks are batched into a single `body` component. Embedded entries (photo, mediaLink) become separate `photo`/`embedwebvideo`/`audio` components with section anchors.

**Section anchor logic:** When an embed component falls between two text sections, it gets `anchor: "body-section-N"` where N is the section that follows it. Embeds at the end (no following text) get no anchor.

**Files:**
- Create: `src/lib/__tests__/richText.test.ts`
- Create: `src/lib/richText.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/richText.test.ts
import { describe, it, expect } from 'vitest';
import { richTextToComponents, nodeToHtml } from '../richText';
import { BLOCKS, INLINES, Document } from '@contentful/rich-text-types';
import type { ResolvedEmbed } from '../../types';

const paragraph = (text: string) => ({
  nodeType: BLOCKS.PARAGRAPH,
  data: {},
  content: [{ nodeType: 'text', value: text, marks: [], data: {} }],
});

const embeddedEntry = (id: string) => ({
  nodeType: BLOCKS.EMBEDDED_ENTRY,
  data: { target: { sys: { id, type: 'Link', linkType: 'Entry' } } },
  content: [],
});

const makeDoc = (...nodes: unknown[]): Document => ({
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: nodes as any,
});

describe('richTextToComponents', () => {
  it('converts a single paragraph to a body component', () => {
    const doc = makeDoc(paragraph('Hello world'));
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('body');
    expect(components[0].id).toBe('body-section-1');
    expect(components[0].format).toBe('html');
    expect(components[0].text as string).toContain('Hello world');
  });

  it('assigns sequential IDs to multiple consecutive text blocks', () => {
    const doc = makeDoc(paragraph('First'), paragraph('Second'));
    // Consecutive text blocks are batched into one body component
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].id).toBe('body-section-1');
  });

  it('splits text blocks at embedded entries', () => {
    const photo: ResolvedEmbed = { type: 'photo', url: 'https://img.example.com/a.jpg' };
    const embedMap = new Map([['photo1', photo]]);
    const doc = makeDoc(paragraph('Before'), embeddedEntry('photo1'), paragraph('After'));
    const components = richTextToComponents(doc, embedMap, new Map());
    // before-text, photo, after-text
    expect(components).toHaveLength(3);
    expect(components[0].role).toBe('body');
    expect(components[0].id).toBe('body-section-1');
    expect(components[1].role).toBe('photo');
    expect(components[1].anchor).toBe('body-section-2');
    expect(components[2].role).toBe('body');
    expect(components[2].id).toBe('body-section-2');
  });

  it('does not add anchor to trailing embed (no following text section)', () => {
    const photo: ResolvedEmbed = { type: 'photo', url: 'https://img.example.com/a.jpg' };
    const embedMap = new Map([['photo1', photo]]);
    const doc = makeDoc(paragraph('Before'), embeddedEntry('photo1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(2);
    expect(components[1].anchor).toBeUndefined();
  });

  it('renders youtube mediaLink as embedwebvideo', () => {
    const ytEmbed: ResolvedEmbed = { type: 'mediaLink', type: 'youtube' as any, url: 'https://www.youtube.com/watch?v=abc' };
    const embedMap = new Map([['yt1', ytEmbed]]);
    const doc = makeDoc(embeddedEntry('yt1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('embedwebvideo');
    expect(components[0].URL).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('renders soundstack mediaLink as audio', () => {
    const audioEmbed: ResolvedEmbed = { type: 'mediaLink', type: 'soundstack' as any, url: 'https://audio.example.com/ep.mp3' };
    const embedMap = new Map([['au1', audioEmbed]]);
    const doc = makeDoc(embeddedEntry('au1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('audio');
    expect(components[0].audioURL).toBe('https://audio.example.com/ep.mp3');
  });

  it('skips unknown embedded entries', () => {
    const doc = makeDoc(embeddedEntry('unknown-id'));
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(0);
  });

  it('renders ENTRY_HYPERLINK as <a> when URL is in linkMap', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{
          nodeType: INLINES.ENTRY_HYPERLINK,
          data: { target: { sys: { id: 'story1', type: 'Link', linkType: 'Entry' } } },
          content: [{ nodeType: 'text', value: 'My Story', marks: [], data: {} }],
        }],
      }],
    };
    const linkMap = new Map([['story1', 'https://www.kcrw.com/stories/my-story']]);
    const components = richTextToComponents(doc, new Map(), linkMap);
    expect(components[0].text as string).toContain('<a href="https://www.kcrw.com/stories/my-story">My Story</a>');
  });

  it('renders ENTRY_HYPERLINK as plain text when URL is null', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{
          nodeType: INLINES.ENTRY_HYPERLINK,
          data: { target: { sys: { id: 'show1', type: 'Link', linkType: 'Entry' } } },
          content: [{ nodeType: 'text', value: 'My Show', marks: [], data: {} }],
        }],
      }],
    };
    const linkMap = new Map<string, string | null>([['show1', null]]);
    const components = richTextToComponents(doc, new Map(), linkMap);
    expect(components[0].text as string).toContain('My Show');
    expect(components[0].text as string).not.toContain('<a ');
  });
});

describe('nodeToHtml', () => {
  it('renders bold mark as <strong>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{ nodeType: 'text', value: 'Bold', marks: [{ type: 'bold' }], data: {} }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<strong>Bold</strong>');
  });

  it('renders italic mark as <em>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{ nodeType: 'text', value: 'Italic', marks: [{ type: 'italic' }], data: {} }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<em>Italic</em>');
  });

  it('renders hyperlink as <a>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{
        nodeType: INLINES.HYPERLINK,
        data: { uri: 'https://example.com' },
        content: [{ nodeType: 'text', value: 'Link', marks: [], data: {} }],
      }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<a href="https://example.com">Link</a>');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test`
Expected: FAIL — `richTextToComponents` and `nodeToHtml` not found.

- [ ] **Step 3: Implement `src/lib/richText.ts`**

```typescript
import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type { Document, Block, Inline, Text, TopLevelBlock } from '@contentful/rich-text-types';
import type { AnfComponent, ResolvedEmbed } from '../types';

/**
 * Converts a Contentful Rich Text Document to an array of ANF components.
 * Consecutive text blocks are batched into a single body component.
 * Embedded photo/video/audio entries become separate ANF components.
 */
export function richTextToComponents(
  doc: Document,
  embedMap: Map<string, ResolvedEmbed>,
  linkMap: Map<string, string | null>,
): AnfComponent[] {
  type RichTextItem =
    | { kind: 'text'; blocks: TopLevelBlock[] }
    | { kind: 'embed'; id: string };

  // First pass: group top-level nodes into text batches and embeds
  const items: RichTextItem[] = [];
  let currentTextBatch: TopLevelBlock[] = [];

  for (const node of doc.content) {
    if (node.nodeType === BLOCKS.EMBEDDED_ENTRY) {
      if (currentTextBatch.length > 0) {
        items.push({ kind: 'text', blocks: currentTextBatch });
        currentTextBatch = [];
      }
      items.push({ kind: 'embed', id: (node as any).data.target.sys.id });
    } else if (
      node.nodeType !== BLOCKS.EMBEDDED_ASSET &&
      node.nodeType !== BLOCKS.HR
    ) {
      currentTextBatch.push(node as TopLevelBlock);
    }
  }
  if (currentTextBatch.length > 0) {
    items.push({ kind: 'text', blocks: currentTextBatch });
  }

  // Second pass: emit ANF components, assign section IDs and anchors
  const components: AnfComponent[] = [];
  let sectionIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'text') {
      sectionIndex++;
      const id = `body-section-${sectionIndex}`;
      const html = item.blocks.map(b => nodeToHtml(b, linkMap)).join('');
      components.push({
        role: 'body',
        id,
        text: html,
        format: 'html',
        layout: 'bodyLayout',
        style: 'bodyStyle',
      });
    } else {
      // embed — check if a text section follows to determine anchor
      const nextItem = items[i + 1];
      const hasFollowingText = nextItem?.kind === 'text';
      const anchor = hasFollowingText ? `body-section-${sectionIndex + 1}` : undefined;
      const embed = embedMap.get(item.id);
      if (!embed) continue;

      const component = embedToComponent(embed, anchor);
      if (component) components.push(component);
    }
  }

  return components;
}

function embedToComponent(
  embed: ResolvedEmbed,
  anchor: string | undefined,
): AnfComponent | null {
  if (embed.type === 'photo') {
    const c: AnfComponent = {
      role: 'photo',
      URL: embed.url,
      layout: 'bodyPhoto',
      style: 'bodyPhotoStyle',
    };
    if (anchor) c.anchor = anchor;
    if (embed.altText) c.accessibilityCaption = embed.altText;
    if (embed.caption || embed.credit) {
      (c as any).caption = {
        role: 'caption',
        text: [embed.caption, embed.credit].filter(Boolean).join(' — '),
        layout: 'captionLayout',
        style: 'captionStyle',
      };
    }
    return c;
  }

  if (embed.type === 'mediaLink') {
    const resolvedMediaLink = embed as unknown as { type: 'youtube' | 'soundstack'; url: string };
    if (resolvedMediaLink.type === 'youtube') {
      const c: AnfComponent = {
        role: 'embedwebvideo',
        URL: resolvedMediaLink.url,
        layout: 'bodyVideoEmbed',
        style: 'bodyVideoEmbedStyle',
      };
      if (anchor) c.anchor = anchor;
      return c;
    }
    if (resolvedMediaLink.type === 'soundstack') {
      const c: AnfComponent = {
        role: 'audio',
        audioURL: resolvedMediaLink.url,
        layout: 'bodyAudioEmbed',
        style: 'bodyAudioEmbedStyle',
      };
      if (anchor) c.anchor = anchor;
      return c;
    }
  }

  return null;
}

/**
 * Renders a single rich text Block node to an HTML string.
 * Exported for testing.
 */
export function nodeToHtml(
  node: Block | Inline,
  linkMap: Map<string, string | null>,
): string {
  switch (node.nodeType) {
    case BLOCKS.PARAGRAPH:
      return `<p>${inlinesToHtml(node.content, linkMap)}</p>`;
    case BLOCKS.HEADING_1:
      return `<h1>${inlinesToHtml(node.content, linkMap)}</h1>`;
    case BLOCKS.HEADING_2:
      return `<h2>${inlinesToHtml(node.content, linkMap)}</h2>`;
    case BLOCKS.HEADING_3:
      return `<h3>${inlinesToHtml(node.content, linkMap)}</h3>`;
    case BLOCKS.HEADING_4:
      return `<h4>${inlinesToHtml(node.content, linkMap)}</h4>`;
    case BLOCKS.HEADING_5:
      return `<h5>${inlinesToHtml(node.content, linkMap)}</h5>`;
    case BLOCKS.HEADING_6:
      return `<h6>${inlinesToHtml(node.content, linkMap)}</h6>`;
    case BLOCKS.UL_LIST:
      return `<ul>${node.content.map(li => `<li>${inlinesToHtml((li as Block).content, linkMap)}</li>`).join('')}</ul>`;
    case BLOCKS.OL_LIST:
      return `<ol>${node.content.map(li => `<li>${inlinesToHtml((li as Block).content, linkMap)}</li>`).join('')}</ol>`;
    case BLOCKS.QUOTE:
      return `<blockquote>${inlinesToHtml(node.content, linkMap)}</blockquote>`;
    default:
      // Unrecognized block — render children as a paragraph
      return `<p>${inlinesToHtml(node.content, linkMap)}</p>`;
  }
}

function inlinesToHtml(
  nodes: (Block | Inline | Text)[],
  linkMap: Map<string, string | null>,
): string {
  return nodes.map(node => inlineToHtml(node, linkMap)).join('');
}

function inlineToHtml(
  node: Block | Inline | Text,
  linkMap: Map<string, string | null>,
): string {
  if (node.nodeType === 'text') {
    const text = node as Text;
    let s = escapeHtml(text.value);
    for (const mark of text.marks) {
      if (mark.type === 'bold') s = `<strong>${s}</strong>`;
      else if (mark.type === 'italic') s = `<em>${s}</em>`;
      else if (mark.type === 'underline') s = `<span data-anf-textstyle="style-underline">${s}</span>`;
      else if (mark.type === 'code') s = `<code>${s}</code>`;
    }
    return s;
  }

  if (node.nodeType === INLINES.HYPERLINK) {
    const inline = node as Inline;
    const href = (inline.data as { uri?: string }).uri ?? '';
    const inner = inlinesToHtml(inline.content as (Block | Inline | Text)[], linkMap);
    return href ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
  }

  if (node.nodeType === INLINES.ENTRY_HYPERLINK) {
    const inline = node as Inline;
    const id = (inline.data as { target?: { sys?: { id?: string } } }).target?.sys?.id ?? '';
    const inner = inlinesToHtml(inline.content as (Block | Inline | Text)[], linkMap);
    const url = linkMap.get(id);
    return url ? `<a href="${escapeAttr(url)}">${inner}</a>` : inner;
  }

  // Embedded inline or unknown — skip
  return '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: All `richText.test.ts` tests PASS. (If a type error appears on the `ResolvedMediaLink` union — `embed.type` is `'photo' | 'mediaLink'` not `'youtube'` — note that the sub-type is accessed via a cast; the test uses `as any` for this reason and the implementation uses a cast too.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/richText.ts src/lib/__tests__/richText.test.ts
git commit -m "feat: add richText.ts — Contentful Rich Text to ANF components"
```

---

## Task 7: article.ts — Build Full ANF Document

Takes a `ResolvedStory` and `AppInstallationParameters` and produces a complete `AnfDocument`. Applies the article base from `templates.py`, assembles the component list, and deep-merges any `articleCustomizationsJson`.

**Files:**
- Create: `src/lib/__tests__/article.test.ts`
- Create: `src/lib/article.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/article.test.ts
import { describe, it, expect } from 'vitest';
import { buildArticle, mergeDeep } from '../article';
import type { ResolvedStory, AppInstallationParameters } from '../../types';
import { BLOCKS } from '@contentful/rich-text-types';

const minimalStory: ResolvedStory = {
  title: 'Test Story',
  description: 'A test description',
  byline: 'by Jane Doe ｜ Monday, January 1, 2024',
  leadImage: null,
  audio: null,
  video: null,
  body: null,
  corrections: null,
  embedMap: new Map(),
  linkMap: new Map(),
};

const baseParams: AppInstallationParameters = {
  apiKeyId: 'k',
  apiKeySecret: 's',
  channelId: 'c',
  locale: 'en-US',
};

describe('buildArticle', () => {
  it('returns a valid ANF document with required fields', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    expect(doc.version).toBe('1.7');
    expect(doc.title).toBe('Test Story');
    expect(doc.identifier).toBe('entry1');
    expect(doc.language).toBe('en-US');
    expect(Array.isArray(doc.components)).toBe(true);
  });

  it('includes title, intro (description), and byline components', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    const roles = doc.components.map(c => c.role);
    expect(roles).toContain('title');
    expect(roles).toContain('intro');
    expect(roles).toContain('body'); // byline as body
  });

  it('does not include a lead photo when leadImage is null', () => {
    const doc = buildArticle('entry1', minimalStory, baseParams);
    expect(doc.components.find(c => c.role === 'photo')).toBeUndefined();
  });

  it('includes a lead photo when leadImage is set', () => {
    const story = { ...minimalStory, leadImage: { url: 'https://img.example.com/photo.jpg', width: 800, height: 600 } };
    const doc = buildArticle('entry1', story, baseParams);
    expect(doc.components.find(c => c.role === 'photo')).toBeDefined();
  });

  it('includes a corrections section after body when corrections is set', () => {
    const story = { ...minimalStory, corrections: 'An earlier version of this story was incorrect.' };
    const doc = buildArticle('entry1', story, baseParams);
    const corrIdx = doc.components.findIndex(c => (c as any).identifier === 'corrections');
    expect(corrIdx).toBeGreaterThan(-1);
  });

  it('includes a footer when footerText is set', () => {
    const params = { ...baseParams, footerText: 'KCRW Member Supported' };
    const doc = buildArticle('entry1', minimalStory, params);
    const footer = doc.components.find(c => c.layout === 'footerLayout');
    expect(footer).toBeDefined();
  });

  it('applies articleCustomizationsJson via deep merge', () => {
    const params = {
      ...baseParams,
      articleCustomizationsJson: JSON.stringify({
        metadata: { generatorName: 'Custom Generator' },
      }),
    };
    const doc = buildArticle('entry1', minimalStory, params);
    expect((doc.metadata as any).generatorName).toBe('Custom Generator');
  });

  it('ignores invalid articleCustomizationsJson without throwing', () => {
    const params = { ...baseParams, articleCustomizationsJson: 'not json' };
    expect(() => buildArticle('entry1', minimalStory, params)).not.toThrow();
  });
});

describe('mergeDeep', () => {
  it('recursively merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10 }, e: 5 };
    const result = mergeDeep(target, source);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3, e: 5 });
  });

  it('source arrays replace target arrays', () => {
    const result = mergeDeep({ arr: [1, 2] }, { arr: [3] });
    expect((result as any).arr).toEqual([3]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test`
Expected: FAIL — `buildArticle` and `mergeDeep` not found.

- [ ] **Step 3: Implement `src/lib/article.ts`**

```typescript
import type { AnfComponent, AnfDocument, AppInstallationParameters, ResolvedStory } from '../types';
import { richTextToComponents } from './richText';

// ── Article base (mirrored from kcrw.plone_apple_news/templates.py) ──────────

const ARTICLE_BASE = {
  version: '1.7',
  layout: { columns: 12, width: 1280, margin: 60, gutter: 20 },
  documentStyle: { backgroundColor: '#FFFFFF' },
  textStyles: {
    'class-style-discreet': { textColor: '#86868B', fontSize: 14 },
    'style-underline': { underline: true },
  },
  componentTextStyles: {
    default: { fontName: 'Helvetica', fontSize: 18, lineHeight: 25, linkStyle: { textColor: '#1D1D1F' } },
    'default-title': { fontSize: 45, lineHeight: 48, fontName: 'Verdana-Bold', hyphenation: false },
    'default-intro': { fontSize: 20 },
    'default-byline': { fontSize: 14, hyphenation: false, textColor: '#86868B' },
    'default-body': { hyphenation: true, paragraphSpacingAfter: 18, paragraphSpacingBefore: 18 },
    'default-caption': { fontSize: 14, textAlignment: 'center', textColor: '#86868B' },
    'body-container': {},
    'body-section': {},
    'body-section-first': {},
    'body-section-last': {},
    'footer-section': {},
    'footer-section-first': {},
    'footer-section-last': {},
  },
  componentStyles: {
    headerStyle: {}, titleStyle: {}, subheadStyle: {}, bylineStyle: {},
    leadPhotoContainerStyle: {}, leadPhotoStyle: {}, leadPhotoCaptionStyle: {},
    bodyStyle: {}, bodyHeadingStyle: {}, bodyHeadingWithBorderStyle: {},
    bodyPhotoStyle: {}, bodyPhotoInsetStyle: {}, bodyPhotoContainerStyle: {},
    captionStyle: {}, bodyImageStyle: {}, bodyVideoEmbedStyle: {},
    headerAudioStyle: {}, headerVideoStyle: {}, bodyAudioEmbedStyle: {},
    footerStyle: {},
  },
  componentLayouts: {
    headerLayout: { margin: { top: 20, bottom: 20 } },
    titleLayout: {},
    subheadLayout: { margin: { top: 5 } },
    bylineLayout: {},
    leadPhotoContainer: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { bottom: 10 } },
    leadPhoto: { ignoreViewportPadding: true, ignoreDocumentMargin: true },
    leadPhotoCaptionLayout: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { top: 2, bottom: 2 } },
    bodyLayout: { margin: { top: 20, bottom: 40 } },
    imageLeft: { columnStart: 0, columnSpan: 4, padding: { top: 0, right: 5, bottom: 10, left: 0 } },
    imageRight: { columnStart: 8, columnSpan: 4, padding: { top: 0, right: 0, bottom: 10, left: 5 } },
    bodyHeading: { margin: { top: 10, bottom: 10 } },
    bodyPhoto: { columnStart: 1, columnSpan: 10, margin: { top: 20, bottom: 20 } },
    captionLayout: { padding: { top: 2, bottom: 2 } },
    bodyImage: {},
    bodyVideoEmbed: { margin: { top: 20, bottom: 20 } },
    headerAudioLayout: { margin: { top: 20, bottom: 20 } },
    headerVideoLayout: { margin: { top: 20, bottom: 20 } },
    bodyAudioEmbed: { margin: { top: 20, bottom: 20 } },
    footerLayout: { margin: { top: 10, bottom: 40 } },
  },
  metadata: {
    generatorName: 'Apple News Contentful',
    generatorVersion: '0.1.0',
  },
};

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a complete ANF document from a resolved story.
 * `entryId` becomes the article's `identifier`.
 */
export function buildArticle(
  entryId: string,
  story: ResolvedStory,
  params: AppInstallationParameters,
): AnfDocument {
  const base = mergeDeep({}, ARTICLE_BASE) as typeof ARTICLE_BASE;
  const components: AnfComponent[] = buildComponents(story, params);

  let doc: AnfDocument = {
    ...base,
    version: ARTICLE_BASE.version,
    identifier: entryId,
    title: story.title,
    language: 'en-US',
    components,
  };

  // Apply articleCustomizationsJson deep-merge
  if (params.articleCustomizationsJson) {
    try {
      const overrides = JSON.parse(params.articleCustomizationsJson) as Record<string, unknown>;
      doc = mergeDeep(doc, overrides) as AnfDocument;
    } catch {
      // ignore invalid JSON
    }
  }

  return doc;
}

function buildComponents(story: ResolvedStory, params: AppInstallationParameters): AnfComponent[] {
  const components: AnfComponent[] = [];

  // 1. Header container: title → intro → byline
  const headerChildren: AnfComponent[] = [];
  headerChildren.push({ role: 'title', text: story.title, layout: 'titleLayout', style: 'titleStyle' });
  if (story.description) {
    headerChildren.push({ role: 'intro', text: story.description, layout: 'subheadLayout', style: 'subheadStyle' });
  }
  if (story.byline) {
    headerChildren.push({ role: 'body', text: story.byline, layout: 'bylineLayout', style: 'bylineStyle' });
  }
  components.push({ role: 'container', layout: 'headerLayout', style: 'headerStyle', components: headerChildren });

  // 2. Lead photo (with optional caption container)
  if (story.leadImage) {
    const photoComponent: AnfComponent = {
      role: 'photo',
      URL: story.leadImage.url,
      layout: 'leadPhoto',
      style: 'leadPhotoStyle',
    };
    if (story.leadImage.altText) photoComponent.accessibilityCaption = story.leadImage.altText;

    if (story.leadImage.caption || story.leadImage.credit) {
      const captionText = [story.leadImage.caption, story.leadImage.credit].filter(Boolean).join(' — ');
      const captionContainer: AnfComponent = {
        role: 'container',
        layout: 'leadPhotoContainer',
        style: 'leadPhotoContainerStyle',
        components: [
          photoComponent,
          { role: 'caption', text: captionText, layout: 'leadPhotoCaptionLayout', style: 'leadPhotoCaptionStyle' },
        ],
      };
      components.push(captionContainer);
    } else {
      photoComponent.layout = 'leadPhotoContainer';
      photoComponent.style = 'leadPhotoStyle';
      components.push(photoComponent);
    }
  }

  // 3. Top-level audio (if present)
  if (story.audio) {
    components.push({
      role: 'audio',
      audioURL: story.audio.url,
      layout: 'headerAudioLayout',
      style: 'headerAudioStyle',
    });
  }

  // 4. Top-level video (if present)
  if (story.video) {
    components.push({
      role: 'embedwebvideo',
      URL: story.video.url,
      layout: 'headerVideoLayout',
      style: 'headerVideoStyle',
    });
  }

  // 5. Body section (rich text)
  if (story.body) {
    const bodyComponents = richTextToComponents(story.body, story.embedMap, story.linkMap);
    components.push(...bodyComponents);
  }

  // 6. Corrections section (after body)
  if (story.corrections) {
    components.push({
      role: 'body',
      identifier: 'corrections',
      text: `<p><strong>Correction:</strong> ${escapeHtml(story.corrections)}</p>`,
      format: 'html',
      layout: 'bodyLayout',
      style: 'bodyStyle',
    });
  }

  // 7. Footer
  if (params.footerText) {
    components.push({
      role: 'body',
      text: params.footerText,
      layout: 'footerLayout',
      style: 'footerStyle',
    });
  }

  return components;
}

/**
 * Recursively deep-merges `source` into `target`.
 * Arrays in `source` replace arrays in `target` (no concatenation).
 * Exported for testing.
 */
export function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      result[key] = mergeDeep(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: All `article.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/article.ts src/lib/__tests__/article.test.ts
git commit -m "feat: add article.ts — builds ANF document from ResolvedStory"
```

---

## Task 8: Function Handlers

The Contentful serverless function handles all App Action calls for publish, update, delete, and checkStatus. The function reads/writes the entry's `appleNewsData` field via CMA to persist state.

**Files:**
- Create: `functions/types.ts`
- Create: `functions/appleNews.ts`
- Create: `functions/index.ts`

- [ ] **Step 1: Create `functions/types.ts`**

```typescript
import { FunctionEventHandler, FunctionTypeEnum } from '@contentful/node-apps-toolkit';
import type { AppInstallationParameters } from '../src/types';

export type EventHandler = FunctionEventHandler<FunctionTypeEnum, AppInstallationParameters>;
export type AppActionHandler = FunctionEventHandler<
  FunctionTypeEnum.AppActionCall,
  AppInstallationParameters
>;
```

- [ ] **Step 2: Create `functions/appleNews.ts`**

```typescript
import type { PlainClientAPI } from 'contentful-management';
import type { AppActionHandler } from './types';
import type {
  AppInstallationParameters,
  AppleNewsData,
  PublishActionResult,
  CheckStatusResult,
  DeleteActionResult,
} from '../src/types';
import type { ApiCredentials } from '../src/lib/api';
import { createArticle, readArticle, updateArticle, deleteArticle } from '../src/lib/api';
import { resolveStory } from '../src/lib/fetch';
import { buildArticle } from '../src/lib/article';

type CmaContext = { cma: PlainClientAPI; spaceId: string; environmentId: string };

async function getAppleNewsData(
  entryId: string,
  locale: string,
  ctx: CmaContext,
  fieldName: string,
): Promise<AppleNewsData | null> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const raw = (entry.fields as Record<string, Record<string, unknown>>)[fieldName]?.[locale];
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed as AppleNewsData;
  } catch {
    return null;
  }
}

async function writeAppleNewsData(
  entryId: string,
  locale: string,
  data: AppleNewsData,
  ctx: CmaContext,
  fieldName: string,
): Promise<void> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
  if (!fields[fieldName]) {
    throw new Error(
      `Field "${fieldName}" not found on this content type. Add a JSON field named "${fieldName}" to the Story content type before using this app.`,
    );
  }
  fields[fieldName][locale] = data;
  await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    { ...entry, fields },
  );
}

async function clearAppleNewsData(
  entryId: string,
  locale: string,
  ctx: CmaContext,
  fieldName: string,
): Promise<void> {
  const entry = await ctx.cma.entry.get({
    spaceId: ctx.spaceId,
    environmentId: ctx.environmentId,
    entryId,
  });
  const fields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
  if (fields[fieldName]) {
    delete fields[fieldName][locale];
  }
  await ctx.cma.entry.update(
    { spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId },
    { ...entry, fields },
  );
}

export const appleNewsHandler: AppActionHandler = async (event, context) => {
  const body = event.body as { action?: string; entryId?: string };
  const { action, entryId } = body;

  if (!entryId) {
    return { success: false, error: 'Missing entryId in request body' } as PublishActionResult;
  }

  const params = context.appInstallationParameters as AppInstallationParameters;
  const { apiKeyId, apiKeySecret, channelId } = params;
  const locale = params.locale ?? 'en-US';
  const fieldName = 'appleNewsData'; // from FIELD_NAMES.appleNewsData in conventions.ts

  const { spaceId, environmentId, cma } = context;
  if (!cma) {
    return { success: false, error: 'CMA client not available in function context' } as PublishActionResult;
  }
  const ctx: CmaContext = { cma, spaceId, environmentId };

  // ── checkStatus ────────────────────────────────────────────────────────────
  if (action === 'checkStatus') {
    try {
      const data = await getAppleNewsData(entryId, locale, ctx, fieldName);
      return { published: !!data?.id, shareUrl: data?.shareUrl } as CheckStatusResult;
    } catch {
      return { published: false } as CheckStatusResult;
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!apiKeyId || !apiKeySecret || !channelId) {
      return { success: false, error: 'Missing Apple News credentials in app configuration.' } as DeleteActionResult;
    }
    const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };
    try {
      const data = await getAppleNewsData(entryId, locale, ctx, fieldName);
      if (data?.id) {
        await deleteArticle(data.id, credentials);
      }
      await clearAppleNewsData(entryId, locale, ctx, fieldName);
      return { success: true } as DeleteActionResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message } as DeleteActionResult;
    }
  }

  // ── publish / update ───────────────────────────────────────────────────────
  if (!apiKeyId || !apiKeySecret || !channelId) {
    return { success: false, error: 'Missing Apple News credentials. Check the app configuration.' } as PublishActionResult;
  }
  const credentials: ApiCredentials = { apiKeyId, apiKeySecret, channelId };

  try {
    const story = await resolveStory(entryId, params, ctx);
    const articleJson = buildArticle(entryId, story, params);

    // Check if already published (update vs create)
    const existingData = await getAppleNewsData(entryId, locale, ctx, fieldName);

    let articleData;
    if (existingData?.id) {
      // Always refresh revision before update to avoid 409 conflicts
      let revision = existingData.revision;
      try {
        const fresh = await readArticle(existingData.id, credentials);
        revision = fresh.revision;
      } catch {
        // use stored revision if read fails
      }
      articleData = await updateArticle(existingData.id, revision, articleJson, credentials);
    } else {
      articleData = await createArticle(articleJson, credentials);
    }

    const data: AppleNewsData = {
      id: articleData.id,
      revision: articleData.revision,
      publishedAt: articleData.publishedAt ?? new Date().toISOString(),
      shareUrl: articleData.shareUrl,
    };
    await writeAppleNewsData(entryId, locale, data, ctx, fieldName);

    return { success: true, shareUrl: data.shareUrl } as PublishActionResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message } as PublishActionResult;
  }
};
```

- [ ] **Step 3: Create `functions/index.ts`**

```typescript
import { EventHandler } from './types';
import { appleNewsHandler } from './appleNews';

export const handler: EventHandler = (event, context) => {
  if (event.type === 'appaction.call') {
    return appleNewsHandler(event, context);
  }
  throw new Error('Bad Request: Unknown Event');
};
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build:functions`
Expected: Exits 0; `build/functions/index.js` created.

If the build fails because `cma.entry.update` signature doesn't match, check the `contentful-management` version's `PlainClientAPI` type. The update call should be:
```typescript
await ctx.cma.entry.update({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId }, entry);
```
Not `{ ...entry, fields }` — update the `entry` object's fields and pass the whole entry:
```typescript
(entry.fields as Record<string, Record<string, unknown>>)[fieldName][locale] = data;
await ctx.cma.entry.update({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId }, entry);
```

Update `functions/appleNews.ts` accordingly if needed.

- [ ] **Step 5: Commit**

```bash
git add functions/
git commit -m "feat: add App Action handlers for publish/update/delete/checkStatus"
```

---

## Task 9: ConfigScreen

The Config screen collects Apple News credentials and optional settings (canonical URL template, locale, customizations JSON, footer text).

**Files:**
- Modify: `src/locations/ConfigScreen.tsx` (replace the stub from Task 1)

- [ ] **Step 1: Implement `src/locations/ConfigScreen.tsx`**

```typescript
import React, { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Heading,
  Form,
  Flex,
  TextInput,
  FormControl,
  Textarea,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import type { AppInstallationParameters } from '../types';

const ConfigScreen = () => {
  const [parameters, setParameters] = useState<AppInstallationParameters>({});
  const sdk = useSDK<ConfigAppSDK>();

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    return { parameters, targetState: currentState };
  }, [parameters, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(onConfigure);
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const currentParameters: AppInstallationParameters | null = await sdk.app.getParameters();
      if (currentParameters) setParameters(currentParameters);
      sdk.app.setReady();
    })();
  }, [sdk]);

  function updateParam<T extends keyof AppInstallationParameters>(key: T) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setParameters(prev => ({ ...prev, [key]: e.target.value }));
    };
  }

  return (
    <Flex flexDirection="column" margin="spacingL">
      <Heading>Apple News Publisher — App Config</Heading>
      <Form>
        <FormControl isRequired isInvalid={!parameters.apiKeyId}>
          <FormControl.Label>API Key ID</FormControl.Label>
          <TextInput
            value={parameters.apiKeyId ?? ''}
            name="apiKeyId"
            onChange={updateParam('apiKeyId')}
          />
          {!parameters.apiKeyId && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.apiKeySecret}>
          <FormControl.Label>API Key Secret</FormControl.Label>
          <TextInput
            value={parameters.apiKeySecret ?? ''}
            name="apiKeySecret"
            type="password"
            onChange={updateParam('apiKeySecret')}
          />
          <FormControl.HelpText>
            Base64-encoded Apple News API key secret.
          </FormControl.HelpText>
          {!parameters.apiKeySecret && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.channelId}>
          <FormControl.Label>Channel ID</FormControl.Label>
          <TextInput
            value={parameters.channelId ?? ''}
            name="channelId"
            onChange={updateParam('channelId')}
          />
          {!parameters.channelId && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl>
          <FormControl.Label>Canonical URL Template</FormControl.Label>
          <TextInput
            value={parameters.canonicalUrlTemplate ?? ''}
            name="canonicalUrlTemplate"
            onChange={updateParam('canonicalUrlTemplate')}
            placeholder="https://www.example.org/stories/{slug}"
          />
          <FormControl.HelpText>
            Used for the article&apos;s canonical web URL. Supports{' '}
            <code>{'{slug}'}</code>. For stories with shows:{' '}
            <code>https://www.example.org/shows/{'{parentSlug}'}/stories/{'{slug}'}</code>.
            Internal rich text hyperlinks also use this base domain. Leave blank to omit.
          </FormControl.HelpText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Locale</FormControl.Label>
          <TextInput
            value={parameters.locale ?? ''}
            name="locale"
            onChange={updateParam('locale')}
            placeholder="en-US"
          />
          <FormControl.HelpText>
            The Contentful locale to read fields from. Defaults to &ldquo;en-US&rdquo;.
          </FormControl.HelpText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Footer Text</FormControl.Label>
          <TextInput
            value={parameters.footerText ?? ''}
            name="footerText"
            onChange={updateParam('footerText')}
            placeholder="Member-supported news"
          />
          <FormControl.HelpText>
            Optional plain text appended as a footer component to every article.
          </FormControl.HelpText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Article Customizations (JSON)</FormControl.Label>
          <Textarea
            value={parameters.articleCustomizationsJson ?? ''}
            name="articleCustomizationsJson"
            rows={8}
            onChange={updateParam('articleCustomizationsJson')}
            placeholder='{"componentStyles":{"titleStyle":{"textColor":"#FF1330"}}}'
          />
          <FormControl.HelpText>
            JSON object deep-merged over the generated article document. Use this to
            override styles, layouts, or typography without modifying code.
          </FormControl.HelpText>
        </FormControl>
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/locations/ConfigScreen.tsx
git commit -m "feat: add ConfigScreen for Apple News credentials and settings"
```

---

## Task 10: EntrySidebar

The sidebar checks publish status on mount (via `checkStatus` App Action), shows publish/update/delete buttons, and displays the share URL link after a successful publish.

**Files:**
- Modify: `src/locations/EntrySidebar.tsx` (replace the stub from Task 1)

- [ ] **Step 1: Implement `src/locations/EntrySidebar.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { SidebarAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Flex,
  Note,
  Spinner,
  Text,
} from '@contentful/f36-components';
import { useSDK, useAutoResizer } from '@contentful/react-apps-toolkit';
import type { PublishActionResult, CheckStatusResult, DeleteActionResult } from '../types';

type PublishState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; shareUrl: string }
  | { status: 'error'; error: string };

type DeleteState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; error: string };

type AppleNewsStatus = 'checking' | 'published' | 'unpublished' | 'unknown';

const EntrySidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  const cma = sdk.cma;
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' });
  const [appleNewsStatus, setAppleNewsStatus] = useState<AppleNewsStatus>('checking');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [entrySys, setEntrySys] = useState(() => sdk.entry.getSys());

  useAutoResizer();

  useEffect(() => {
    return sdk.entry.onSysChanged(setEntrySys);
  }, [sdk.entry]);

  // Check current Apple News status on mount
  useEffect(() => {
    cma.appActionCall
      .createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { action: 'checkStatus', entryId: sdk.ids.entry } },
      )
      .then(result => {
        const body = JSON.parse(result.response.body) as CheckStatusResult;
        setAppleNewsStatus(body.published ? 'published' : 'unpublished');
        if (body.shareUrl) setShareUrl(body.shareUrl);
      })
      .catch(() => setAppleNewsStatus('unknown'));
  }, [sdk.ids, cma]);

  const isPublishedInContentful = entrySys.publishedVersion != null;
  const isBusy = publishState.status === 'loading' || deleteState.status === 'loading';

  const publishButtonLabel =
    appleNewsStatus === 'checking' ? (
      <Flex alignItems="center" gap="spacingXs">
        <Spinner size="small" />
        <Text>Checking Apple News status…</Text>
      </Flex>
    ) : appleNewsStatus === 'published' ? (
      'Update in Apple News'
    ) : (
      'Publish to Apple News'
    );

  const handlePublish = async () => {
    setDeleteState({ status: 'idle' });
    setPublishState({ status: 'loading' });
    try {
      const result = await cma.appActionCall.createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { entryId: sdk.ids.entry } },
      );
      const body = JSON.parse(result.response.body) as PublishActionResult;
      if (body.success && body.shareUrl) {
        setPublishState({ status: 'success', shareUrl: body.shareUrl });
        setShareUrl(body.shareUrl);
        setAppleNewsStatus('published');
      } else {
        setPublishState({ status: 'error', error: body.error ?? 'Unknown error publishing to Apple News' });
      }
    } catch (err: unknown) {
      setPublishState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDelete = async () => {
    setPublishState({ status: 'idle' });
    setDeleteState({ status: 'loading' });
    try {
      const result = await cma.appActionCall.createWithResponse(
        {
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          appDefinitionId: sdk.ids.app ?? '',
          appActionId: 'publishToAppleNews',
        },
        { parameters: { action: 'delete', entryId: sdk.ids.entry } },
      );
      const body = JSON.parse(result.response.body) as DeleteActionResult;
      if (body.success) {
        setDeleteState({ status: 'success' });
        setShareUrl(null);
        setAppleNewsStatus('unpublished');
      } else {
        setDeleteState({ status: 'error', error: body.error ?? 'Unknown error removing from Apple News' });
      }
    } catch (err: unknown) {
      setDeleteState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Flex flexDirection="column" gap="spacingS" style={{ wordBreak: 'break-word' }}>
      {!isPublishedInContentful && (
        <Note variant="warning">
          Entry must be published in Contentful before sending to Apple News.
        </Note>
      )}

      <Button
        variant="primary"
        onClick={handlePublish}
        isDisabled={isBusy || !isPublishedInContentful || appleNewsStatus === 'checking'}
        isFullWidth
      >
        {publishState.status === 'loading' ? (
          <Flex alignItems="center" gap="spacingXs">
            <Spinner size="small" />
            <Text>{appleNewsStatus === 'published' ? 'Updating…' : 'Publishing…'}</Text>
          </Flex>
        ) : (
          publishButtonLabel
        )}
      </Button>

      {publishState.status === 'success' && (
        <Note variant="positive" title="Published to Apple News">
          <Text>
            <a href={publishState.shareUrl} target="_blank" rel="noreferrer">
              View in Apple News
            </a>
          </Text>
        </Note>
      )}

      {publishState.status === 'error' && (
        <Note variant="negative" title="Publish failed">
          <Text>{publishState.error}</Text>
        </Note>
      )}

      {appleNewsStatus === 'published' && shareUrl && publishState.status === 'idle' && (
        <Note variant="neutral">
          <Text>
            Published:{' '}
            <a href={shareUrl} target="_blank" rel="noreferrer">
              View in Apple News
            </a>
          </Text>
        </Note>
      )}

      {appleNewsStatus === 'published' && deleteState.status === 'confirming' ? (
        <Flex flexDirection="column" gap="spacingXs">
          <Text fontColor="gray700" fontSize="fontSizeS">
            Remove this story from Apple News?
          </Text>
          <Flex gap="spacingXs">
            <Button variant="negative" size="small" onClick={handleDelete} isFullWidth>
              Delete
            </Button>
            <Button variant="secondary" size="small" onClick={() => setDeleteState({ status: 'idle' })} isFullWidth>
              Cancel
            </Button>
          </Flex>
        </Flex>
      ) : appleNewsStatus === 'published' ? (
        <Button
          variant="negative"
          onClick={() => setDeleteState({ status: 'confirming' })}
          isDisabled={isBusy || deleteState.status === 'success'}
          isFullWidth
        >
          {deleteState.status === 'loading' ? (
            <Flex alignItems="center" gap="spacingXs">
              <Spinner size="small" />
              <Text>Removing…</Text>
            </Flex>
          ) : (
            'Remove from Apple News'
          )}
        </Button>
      ) : null}

      {deleteState.status === 'success' && (
        <Note variant="positive" title="Removed from Apple News">
          <Text>The story has been removed from Apple News.</Text>
        </Note>
      )}

      {deleteState.status === 'error' && (
        <Note variant="negative" title="Remove failed">
          <Text>{deleteState.error}</Text>
        </Note>
      )}
    </Flex>
  );
};

export default EntrySidebar;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Full build check**

Run: `npm run build`
Expected: Exits 0; both `build/` (frontend) and `build/functions/index.js` produced.

- [ ] **Step 4: Commit**

```bash
git add src/locations/EntrySidebar.tsx
git commit -m "feat: add EntrySidebar for Apple News publish/update/delete UI"
```

---

## Task 11: Deployment Tools

Two CLI tools: `create-app-action` registers the App Action in Contentful; `preview-article` prints the ANF JSON for an entry without publishing, for debugging.

**Files:**
- Create: `src/tools/imports.ts`
- Create: `src/tools/create-app-action.ts`
- Create: `src/tools/preview-article.ts`

- [ ] **Step 1: Create `src/tools/imports.ts`**

```typescript
import manifest from '../../contentful-app-manifest.json';
import assert from 'assert';
import * as dotenv from 'dotenv';
dotenv.config();

assert.equal(typeof manifest, 'object', 'Manifest is not an object');
assert.ok(Array.isArray(manifest.functions), 'Functions must be an array in the manifest');

const {
  CONTENTFUL_ORG_ID: organizationId = '',
  CONTENTFUL_APP_DEF_ID: appDefinitionId = '',
  CONTENTFUL_ACCESS_TOKEN: accessToken = '',
  CONTENTFUL_HOST: contentfulHost = '',
  CONTENTFUL_SPACE_ID: spaceId = '',
  CONTENTFUL_ENVIRONMENT_ID: environmentId = 'master',
} = process.env;

assert.ok(organizationId !== '', 'CONTENTFUL_ORG_ID must be set');
assert.ok(appDefinitionId !== '', 'CONTENTFUL_APP_DEF_ID must be set');
assert.ok(accessToken !== '', 'CONTENTFUL_ACCESS_TOKEN must be set');

export {
  organizationId,
  appDefinitionId,
  accessToken,
  contentfulHost,
  spaceId,
  environmentId,
  manifest,
};
```

- [ ] **Step 2: Create `src/tools/create-app-action.ts`**

```typescript
import { createClient } from 'contentful-management';
import { organizationId, appDefinitionId, accessToken, contentfulHost, manifest } from './imports';

const host = contentfulHost || 'api.contentful.com';
const client = createClient({ accessToken, host }, { type: 'plain' });
const functionId = manifest.functions[0].id;

const main = async () => {
  const result = await client.appAction.create(
    { organizationId, appDefinitionId },
    {
      id: 'publishToAppleNews',
      type: 'function-invocation',
      function: {
        sys: { type: 'Link', linkType: 'Function', id: functionId },
      },
      category: 'Custom',
      name: 'Publish to Apple News',
      description: 'Publishes, updates, or removes this story in Apple News Publisher.',
      parameters: [
        {
          id: 'entryId',
          name: 'Entry ID',
          description: 'The Contentful entry ID of the story to publish',
          type: 'Symbol',
          required: true,
        },
        {
          id: 'action',
          name: 'Action',
          description: "Optional action: 'checkStatus' or 'delete'. Omit for publish/update.",
          type: 'Symbol',
          required: false,
        },
      ],
    },
  );
  console.log('App action created:');
  console.dir(result, { depth: 5 });
};

main().catch(err => {
  console.error('Failed to create app action:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Create `src/tools/preview-article.ts`**

```typescript
/**
 * Prints the ANF JSON for a given entry without publishing to Apple News.
 * Usage: npm run preview-article:dev -- <entryId>
 */
import { createClient } from 'contentful-management';
import { accessToken, spaceId, environmentId, contentfulHost } from './imports';
import { resolveStory } from '../lib/fetch';
import { buildArticle } from '../lib/article';
import type { AppInstallationParameters } from '../types';

const entryId = process.argv[2];
if (!entryId) {
  console.error('Usage: npm run preview-article:dev -- <entryId>');
  process.exit(1);
}

const params: AppInstallationParameters = {
  locale: process.env.LOCALE ?? 'en-US',
  canonicalUrlTemplate: process.env.CANONICAL_URL_TEMPLATE ?? '',
  footerText: process.env.FOOTER_TEXT,
  articleCustomizationsJson: process.env.ARTICLE_CUSTOMIZATIONS_JSON,
};

const main = async () => {
  const host = contentfulHost || 'api.contentful.com';
  const cma = createClient({ accessToken, host }, { type: 'plain' });
  const story = await resolveStory(entryId, params, { cma, spaceId, environmentId });
  const article = buildArticle(entryId, story, params);
  console.log(JSON.stringify(article, null, 2));
};

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Verify tools compile**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/tools/
git commit -m "feat: add create-app-action and preview-article tools"
```

---

## Task 12: README

The README is the primary guide for engineers setting up and customizing this app. It covers first-time setup, customization, and the content type requirements.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, customization, and architecture guide"
```

---

## Final verification

- [ ] **Run all tests one last time**

Run: `npm test`
Expected: All tests PASS with output similar to:
```
 ✓ src/lib/__tests__/api.test.ts (4)
 ✓ src/lib/__tests__/fetch.test.ts (5)
 ✓ src/lib/__tests__/richText.test.ts (9)
 ✓ src/lib/__tests__/article.test.ts (8)

 Test Files  4 passed (4)
 Tests       26 passed (26)
```

- [ ] **Full build**

Run: `npm run build`
Expected: Exits 0.

- [ ] **Type check**

Run: `npm run type-check`
Expected: No errors.
