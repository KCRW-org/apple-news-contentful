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

This is a **Contentful App** (React SPA + Contentful App Actions) that publishes entries to Apple News Publisher. Adapt it to a different Contentful content model by replacing `src/lib/site.ts`.

### Two execution environments

| Layer | Entry point | Runtime | Purpose |
|---|---|---|---|
| **Frontend** | `src/index.tsx` → `src/App.tsx` | Browser (Vite/React) | Contentful UI locations |
| **Functions** | `functions/index.ts` → `functions/appleNews.ts` | Contentful App Actions (Node) | Apple News API calls |

`functions/appleNews.ts` imports shared library code directly from `src/lib/` — the esbuild config bundles them together.

### Key files

- **`functions/appleNews.ts`** — App Action handler: `publish`, `delete`, `checkStatus`, `refreshStatus`. The `publish` action creates or updates (no separate `update` action). Pre-flight conflict check (readArticle before resolveStory): detects state/revision drift and 404 (article deleted). Returns `{ conflict }` for the UI to confirm; re-call with `confirmed: true` (encoded in the JSON action string) to bypass. Auto-retries on `WRONG_REVISION`.
- **`functions/appEvents.ts`** — Handles `unpublish`/`archive` lifecycle events; deletes Apple News article and clears `appleNewsData`.
- **`src/locations/useAppleNews.ts`** — Shared hook (sidebar + editor). State machines for publish/delete, exponential-backoff polling (3s→60s, 10min budget), permission checks.
- **`src/lib/siteConfig.ts`** — `SiteConfig` TypeScript interface: the full contract between framework code and site-specific logic. No implementation.
- **`src/lib/site.ts`** — **Primary customization point.** KCRW implementation of `SiteConfig`. Contains all field name constants, content type IDs, resolver functions (`resolveImage`, `resolvePeople`, `formatByline`, `authorNames`, `resolveEntryUrl`, `resolveParentSlug`, `resolveMediaLink`, `resolveArticleMetadata`, `renderAfterBody`, `renderThumbnailUrl`), and the ANF article base (skeleton + brand overrides). Forks replace this single file. Exports `siteConfig`, `fieldNames`, `contentTypeIds`.
- **`src/lib/utilities.ts`** — Generic helpers with no site-specific logic: `buildThumbnailUrl` (ANF 1:2–3:1 aspect-ratio clamping), `IMAGE_TARGET_WIDTHS`, `resolveAssetInfo`, `mergeDeep`, `stripMarkdown`, etc.
- **`src/lib/fetch.ts`** — Resolves a Contentful entry into a flat `ResolvedStory` via `EntrySource`. Single `getEntryWithIncludes` call at depth 3 provides all linked entries and assets; no per-link round-trips. Delegates all site-specific resolution to `siteConfig`.
- **`src/lib/article.ts`** — Builds ANF from `ResolvedStory` using `siteConfig.articleBase`. Sets `metadata.thumbnailURL`, `canonicalURL`, `authors`, `excerpt`. Deep-merges `articleCustomizationsJson` from config at the end.
- **`src/lib/entrySource.ts`** — `EntrySource` interface + CDA/CPA implementation via `createDeliveryEntrySource`. CDA returns published entries only; pass CPA base URL for draft-inclusive preview/download flows.
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

## MCP Tools

**Scope: this entire section applies to the main agent only. Sub-agents (spawned via the Agent / Task tool) should skip the MCP startup ritual and use Bash/Read/Grep/Edit directly. Sub-agents inherit a small context budget; reflexive MCP calls blow it on JSON output before the actual task.**

**IMPORTANT (main agent): ALWAYS use MCP tools BEFORE Grep/Glob/Read/Bash to explore the codebase.**

### Session start

At the start of every session, call these two tools in sequence before any code exploration:

1. `mcp__token-savior__set_project_root({ path: "/Users/alecmitchell/Development/bundles/kcrw/apple-news-contentful" })`
2. `mcp__token-savior__reindex({})`

No-op if nothing changed — cheap to run unconditionally.

### Session handoff

When running `/session-handoff`, call `mcp__token-savior__reindex` first so the index is current before the handoff summary is generated.

### Decision guide

| Task | Tool |
|------|------|
| **About to edit a symbol** | `get_edit_context` — source + deps + callers + tests in one call |
| Just need a function's source | `get_function_source` or `get_full_context` |
| Find a function/class by name or concept | `find_symbol` or `search_codebase` |
| Blast radius of a symbol-level change | `get_change_impact` |
| Tracing callers / callees | `get_dependents` / `get_dependencies` |
| End-to-end call chain | `get_call_chain` |
| Finding dead / unused code | `find_dead_code` |
| Architecture / high-level structure | `get_project_summary` |
| Remembering context across sessions | `memory_save` / `memory_search` |
| Checking token budget this session | `get_session_budget` |

### Key tools

| Tool | Use when |
|------|----------|
| `get_edit_context` | **Before editing** — source + deps + callers + siblings + tests |
| `get_full_context` | Symbol source + depth-1 deps/dependents (batch up to 10) |
| `get_function_source` | Just one function's source |
| `get_change_impact` | Symbol-level transitive dependents |
| `get_call_chain` | End-to-end call path tracing |
| `search_codebase` | Regex search across all indexed files |
| `find_dead_code` | Unused exports |
| `memory_save` / `memory_search` | Persist notes across sessions |
| `get_session_budget` | Check token usage this session |

### Typical workflows

**Editing a symbol**
1. `get_edit_context <symbol>` — everything needed in one call
2. Edit the file
3. `get_change_impact <symbol>` — verify no unexpected breakage

**Exploring unfamiliar code**
1. `find_symbol` or `search_codebase` — locate the symbol
2. `get_full_context` — source + immediate deps
3. `get_dependents` — who calls it

> Fetch tool schemas via `ToolSearch` before the first call in a session (e.g. `"select:mcp__token-savior__get_edit_context"`).
