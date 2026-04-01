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
    ...hyperlinkIds.map(id => resolveHyperlink(id, locale, ctx, linkMap, params.canonicalUrlTemplate ?? '')),
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
    const url = rawFields[MEDIA_LINK_SUBFIELDS.mediaUrl]?.[locale] as string | undefined;
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
    const url = rawFields[MEDIA_LINK_SUBFIELDS.mediaUrl]?.[locale] as string | undefined;
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
        embedMap.set(id, { type: 'youtube', url });
      } else if (url && hosting === 'soundstack') {
        embedMap.set(id, { type: 'soundstack', url });
      }
    }
  } catch {
    // skip unresolvable embeds
  }
}

async function resolveHyperlink(
  id: string,
  locale: string,
  ctx: CmaContext,
  linkMap: Map<string, string | null>,
  canonicalUrlTemplate: string,
): Promise<void> {
  try {
    const entry = await ctx.cma.entry.get({ spaceId: ctx.spaceId, environmentId: ctx.environmentId, entryId: id });
    const rawFields = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const __typename = (entry.sys as { contentType?: { sys?: { id?: string } } }).contentType?.sys?.id ?? '';
    const slug = rawFields[FIELD_NAMES.slug]?.[locale] as string | undefined;
    const showsCollection = rawFields[FIELD_NAMES.showsCollection]?.[locale] as { items?: { fields?: Record<string, Record<string, unknown>> }[] } | undefined;
    const parentSlug = showsCollection?.items?.[0]?.fields?.[FIELD_NAMES.slug]?.[locale] as string | undefined;
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
