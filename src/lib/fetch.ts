import type { Document } from '@contentful/rich-text-types';
import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type {
  AppInstallationParameters,
  ResolvedStory,
  ResolvedEmbed,
  ResolvedImage,
  ResolvedAudio,
  ResolvedVideo,
} from '../types';
import type { ImageRole } from '../types';
import { siteConfig, fieldNames, contentTypeIds } from './site';
import type { EntrySource, SourcedEntry, SourcedAsset } from './entrySource';

/**
 * Resolves a Contentful story entry to a flat ResolvedStory shape.
 *
 * Makes a single `getEntryWithIncludes` call at depth 3 to fetch the story and all
 * linked entries/assets in one request. All resolution is then done via synchronous
 * map lookups — no per-link round-trips. Body hyperlinks still need individual
 * `getEntryWithIncludes` calls to walk their parent-slug chains.
 */
export async function resolveStory(
  entryId: string,
  params: AppInstallationParameters,
  source: EntrySource,
): Promise<ResolvedStory> {
  const { entry, entriesById, assetsById } = await source.getEntryWithIncludes(entryId, 3);
  if (!entry) {
    throw new Error(`Entry ${entryId} not found in the configured delivery source.`);
  }
  const fields = entry.fields;

  const title = ((fields[fieldNames.title] as string | undefined) ?? '').trim();
  const description = (fields[fieldNames.description] as string | undefined) ?? null;
  const corrections = (fields[fieldNames.corrections] as string | undefined) ?? null;
  const bylineDate = (fields[fieldNames.bylineDate] as string | undefined) ?? null;
  const bylineCount = (fields[fieldNames.bylineCount] as number | undefined) ?? 1;
  const body = (fields[fieldNames.body] as Document | undefined) ?? null;

  const imageLink = fields[fieldNames.image] as { sys: { id: string } } | undefined;
  const audioLink = fields[fieldNames.audioMedia] as { sys: { id: string } } | undefined;
  const videoLink = fields[fieldNames.videoMedia] as { sys: { id: string } } | undefined;

  const warnings: string[] = [];

  const people = siteConfig.resolvePeople(fields, entriesById, warnings);
  const showTitle = resolveFirstCollectionTitle(fields, fieldNames.showsCollection, entriesById, warnings, 'show');
  const categoryTitle = resolveFirstCollectionTitle(fields, fieldNames.categoriesCollection, entriesById, warnings, 'category');
  const categoryLinks = (fields[fieldNames.categoriesCollection] as { sys: { id: string } }[] | undefined) ?? [];
  const categoryIds = categoryLinks.map(l => l.sys.id);
  const leadImage = imageLink ? resolveImageEntry(imageLink.sys.id, entriesById, assetsById, warnings, 'Lead image', 'lead') : null;

  const slug = fields[fieldNames.slug] as string | undefined;
  const parentLookup = new Map(
    [...entriesById.entries()].map(([id, e]) => [id, { contentType: e.contentType, fields: e.fields }]),
  );
  const parent = siteConfig.resolveParentSlug(fields, entry.contentType, parentLookup);
  const canonicalUrl = siteConfig.resolveEntryUrl(
    { contentType: entry.contentType, slug, parentSlug: parent?.slug, parentContentType: parent?.contentType },
    params.canonicalUrlTemplate ?? '',
  );

  let thumbnailUrl: string | null = null;
  if (leadImage) {
    thumbnailUrl = siteConfig.renderThumbnailUrl(leadImage);
  } else {
    const showItems = (fields[fieldNames.showsCollection] as { sys: { id: string } }[] | undefined) ?? [];
    const showId = showItems[0]?.sys?.id;
    const showEntry = showId ? entriesById.get(showId) : undefined;
    if (showEntry) {
      const showImageLink = showEntry.fields[fieldNames.image] as { sys: { id: string } } | undefined;
      if (showImageLink) {
        const showImage = resolveImageEntry(showImageLink.sys.id, entriesById, assetsById, warnings, 'Show image', 'thumb');
        thumbnailUrl = showImage ? siteConfig.renderThumbnailUrl(showImage) : null;
      }
    }
  }

  const audio = audioLink ? resolveAudioEntry(audioLink.sys.id, entriesById, warnings) : null;
  const video = videoLink ? resolveVideoEntry(videoLink.sys.id, entriesById, warnings) : null;

  const embeddedIds = body ? collectEmbeddedEntryIds(body) : [];
  const hyperlinkIds = body ? collectEntryHyperlinkIds(body) : [];

  const embedMap = new Map<string, ResolvedEmbed>();
  for (const id of embeddedIds) {
    resolveBodyEmbed(id, entriesById, assetsById, embedMap, warnings);
  }

  const linkMap = new Map<string, string | null>();
  await Promise.all(
    hyperlinkIds.map(id => resolveHyperlink(id, source, linkMap, params.canonicalUrlTemplate ?? '', warnings)),
  );

  return {
    title,
    description,
    showTitle,
    people,
    bylineDate,
    bylineCount,
    categoryTitle,
    categoryIds,
    leadImage,
    thumbnailUrl,
    canonicalUrl,
    audio,
    video,
    body,
    corrections,
    embedMap,
    linkMap,
    warnings,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function resolveFirstCollectionTitle(
  fields: Record<string, unknown>,
  collectionField: string,
  entriesById: Map<string, SourcedEntry>,
  warnings: string[],
  label: string,
): string | null {
  const items = (fields[collectionField] as { sys: { id: string } }[] | undefined) ?? [];
  const firstLink = items[0];
  if (!firstLink) return null;
  const id = firstLink.sys.id;
  const entry = entriesById.get(id);
  if (!entry) {
    warnings.push(`${label} entry ${id} not found; title omitted.`);
    return null;
  }
  const title = entry.fields[fieldNames.title] as string | undefined;
  return title?.trim() ? title.trim() : null;
}

function resolveImageEntry(
  id: string,
  entriesById: Map<string, SourcedEntry>,
  assetsById: Map<string, SourcedAsset>,
  warnings: string[],
  label: string,
  role: ImageRole,
): ResolvedImage | null {
  const entry = entriesById.get(id);
  if (!entry) {
    warnings.push(`${label} (entry ${id}) not found; article will publish without it.`);
    return null;
  }

  const resolved = siteConfig.resolveImage(entry.fields, role, assetsById);
  if (!resolved) {
    warnings.push(`${label} (entry ${id}) could not be resolved; article will publish without it.`);
  }
  return resolved;
}

function resolveAudioEntry(
  id: string,
  entriesById: Map<string, SourcedEntry>,
  warnings: string[],
): ResolvedAudio | null {
  const entry = entriesById.get(id);
  if (!entry) {
    warnings.push(`Audio media entry ${id} not found; article will publish without it.`);
    return null;
  }
  const url = entry.fields['mediaUrl'] as string | undefined;
  if (!url) {
    warnings.push(`Audio media entry ${id} has no mediaUrl; article will publish without it.`);
    return null;
  }
  return { url };
}

function resolveVideoEntry(
  id: string,
  entriesById: Map<string, SourcedEntry>,
  warnings: string[],
): ResolvedVideo | null {
  const entry = entriesById.get(id);
  if (!entry) {
    warnings.push(`Video media entry ${id} not found; article will publish without it.`);
    return null;
  }
  const url = entry.fields['mediaUrl'] as string | undefined;
  if (!url) {
    warnings.push(`Video media entry ${id} has no mediaUrl; article will publish without it.`);
    return null;
  }
  return { url };
}

function resolveBodyEmbed(
  id: string,
  entriesById: Map<string, SourcedEntry>,
  assetsById: Map<string, SourcedAsset>,
  embedMap: Map<string, ResolvedEmbed>,
  warnings: string[],
): void {
  const entry = entriesById.get(id);
  if (!entry) {
    warnings.push(`Embedded entry ${id} not found; it will be omitted from the body.`);
    return;
  }
  if (entry.contentType === contentTypeIds.photo) {
    const image = siteConfig.resolveImage(entry.fields, 'body', assetsById);
    if (image) embedMap.set(id, { type: 'photo', ...image });
    else warnings.push(`Embedded photo entry ${id} could not be resolved; it will be omitted from the body.`);
  } else if (entry.contentType === contentTypeIds.mediaLink) {
    const media = siteConfig.resolveMediaLink(entry.fields);
    if (media) embedMap.set(id, media);
    else warnings.push(`Embedded media entry ${id} could not be resolved; it will be omitted from the body.`);
  } else {
    warnings.push(`Embedded entry ${id} has unsupported content type "${entry.contentType}"; it will be omitted from the body.`);
  }
}

async function resolveHyperlink(
  id: string,
  source: EntrySource,
  linkMap: Map<string, string | null>,
  canonicalUrlTemplate: string,
  warnings: string[],
): Promise<void> {
  try {
    const { entry, entriesById } = await source.getEntryWithIncludes(id, 3);
    if (!entry) {
      linkMap.set(id, null);
      warnings.push(`Linked entry ${id} referenced in body not found; link will be dropped.`);
      return;
    }

    const lookup = new Map<string, { contentType: string; fields: Record<string, unknown> }>(
      [...entriesById.entries()].map(([eid, e]: [string, SourcedEntry]) => [eid, { contentType: e.contentType, fields: e.fields }]),
    );

    const slug = entry.fields[fieldNames.slug] as string | undefined;
    const parent = siteConfig.resolveParentSlug(entry.fields, entry.contentType, lookup);
    const url = siteConfig.resolveEntryUrl(
      { contentType: entry.contentType, slug, parentSlug: parent?.slug, parentContentType: parent?.contentType },
      canonicalUrlTemplate,
    );
    linkMap.set(id, url);
    if (!url) {
      warnings.push(`Linked entry ${id} (${entry.contentType || 'unknown type'}) did not resolve to a URL; link will be dropped.`);
    }
  } catch (err) {
    const msg = `Linked entry ${id} could not be resolved: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[fetch] ${msg}`);
    warnings.push(msg);
    linkMap.set(id, null);
  }
}

/** Collects entry IDs of all top-level BLOCKS.EMBEDDED_ENTRY nodes in a rich text document. */
function collectEmbeddedEntryIds(doc: Document): string[] {
  return doc.content
    .filter(node => node.nodeType === BLOCKS.EMBEDDED_ENTRY)
    .map(node => (node as any).data.target.sys.id as string);
}

/** Recursively collects entry IDs of all INLINES.ENTRY_HYPERLINK nodes in a rich text document. */
function collectEntryHyperlinkIds(doc: Document): string[] {
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
  return [...new Set(ids)];
}
