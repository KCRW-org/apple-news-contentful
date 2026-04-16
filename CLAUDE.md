# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server (UI only, port 3000)
npm test               # Run tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run type-check     # TypeScript check (no emit)
npm run build          # Full build: frontend (vite) + functions (esbuild)
npm run build:functions  # Build Contentful App Actions only

# Dev tools (require .env.development)
npm run preview-article:dev -- <entry-id>  # Print ANF JSON for a Contentful entry
npm run create-app-action:dev              # Register App Action in Contentful
npm run upload:dev                         # Upload built bundle to Contentful
npm run install-app:dev                    # Install app in the configured space
npm run update-docs                        # Re-fetch Apple News Format + API docs into docs/
```

Tests live in `src/lib/__tests__/`. Run a single test file:
```bash
npx vitest run src/lib/__tests__/article.test.ts
```

## Architecture

This is a **Contentful App** (React SPA + Contentful App Actions) that publishes entries to Apple News Publisher. Adapt it to a different Contentful content model by editing `src/lib/conventions.ts`.

### Two execution environments

| Layer | Entry point | Runtime | Purpose |
|---|---|---|---|
| **Frontend** | `src/index.tsx` → `src/App.tsx` | Browser (Vite/React) | Contentful UI locations |
| **Functions** | `functions/index.ts` → `functions/appleNews.ts` | Contentful App Actions (Node) | Apple News API calls |

`functions/appleNews.ts` imports shared library code directly from `src/lib/` — the esbuild config bundles them together.

### Key files

- **`functions/appleNews.ts`** — App Action handler: `publish`, `update`, `delete`, `checkStatus`, `refreshStatus`. Validates entry is published before publishing. Auto-retries on `WRONG_REVISION`.
- **`functions/appEvents.ts`** — Handles `unpublish`/`archive` lifecycle events; deletes Apple News article and clears `appleNewsData`.
- **`src/locations/useAppleNews.ts`** — Shared hook (sidebar + editor). State machines for publish/delete, exponential-backoff polling (3s→60s, 10min budget), permission checks.
- **`src/lib/conventions.ts`** — **Primary customization point.** Field name constants, shared types, and resolver functions (`formatByline`, `authorNames`, `resolveImage`, `resolveEntryUrl`, `renderAfterBody`, `resolveParentSlug`, `resolveMediaLink`, `resolveArticleMetadata`). Also holds `ARTICLE_BASE_STRUCTURE` and exports `ARTICLE_BASE` (base merged with `KCRW_OVERRIDES`).
- **`src/lib/kcrw.ts`** — KCRW-specific private helpers (`selectBylinePeople`, `renderCreditsComponent`, `urlWithParent`, `renderThumbnailUrl`) and `KCRW_OVERRIDES` (ANF brand fonts, colors, layouts, dark mode). Replace to adapt to a different brand.
- **`src/lib/utilities.ts`** — Generic helpers with no site-specific logic: `buildThumbnailUrl` (ANF 1:2–3:1 aspect-ratio clamping), `IMAGE_TARGET_WIDTHS`, `resolveAssetInfo`, `mergeDeep`, `stripMarkdown`, etc.
- **`src/lib/fetch.ts`** — Resolves a Contentful entry into a flat `ResolvedStory` via `EntrySource`. Single `references` call at depth 3 provides all linked entries and assets; no per-link round-trips. Imports `renderThumbnailUrl` from `kcrw.ts`.
- **`src/lib/article.ts`** — Builds ANF from `ResolvedStory` using `ARTICLE_BASE` from `conventions.ts`. Sets `metadata.thumbnailURL`, `canonicalURL`, `authors`, `excerpt`. Deep-merges `articleCustomizationsJson` from config at the end.
- **`src/lib/entrySource.ts`** — `EntrySource` interface + CMA implementation. `publishedOnly: true` (default) uses `getPublished`/asset filtering so drafts never reach Apple News; `false` for preview/download flows.
- **`src/lib/api.ts`** — HMAC-SHA256-signed multipart HTTP calls to Apple News Publisher API.
- **`src/locations/downloadPreview.ts`** — Builds `.news.zip` (article.json + bundled images) in-browser via CPA for the Apple News Preview macOS app.

### App state

Publish state (article ID, revision, share URL, processing state, `isPreview` flag) is written back to the entry's `appleNewsData` JSON field after each publish/update. Cleared on unpublish/archive.

### Cross-iframe sync

`useAppleNews` runs independently in each iframe (sidebar + editor). On `onSysChanged`, both iframes re-fetch `appleNewsData` via CMA (`syncFromCma`) — reliable for server-side writes. Do not use `sdk.entry.fields[...].getValue()` for server-originated changes; the in-iframe field cache misses them. See `memory/sync_fix_solution.md` for invariants.

### Reference Documentation

- **`docs/apple-news-format.md`** — Curated ANF reference. Start here.
- **`docs/apple-news-api.md`** — Curated Apple News Publisher API reference. Start here.
- **`docs/raw/`** — Raw docs from Apple's JSON API. Regenerate with `npm run update-docs`.

### Dev environment

Credentials go in `.env.development` (copy from `.env.example`). The `CONTENTFUL_APP_DEF_ID` quirk: `create-app-definition` writes the new ID to `.env`, not `.env.development` — copy it over manually.
