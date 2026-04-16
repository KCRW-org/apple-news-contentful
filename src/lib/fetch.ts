import type { Document } from '@contentful/rich-text-types';
import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type {
  AppInstallationParameters,
  ResolvedStory,
  ResolvedEmbed,
  ResolvedImage,
  ResolvedAudio,
  ResolvedVideo,
  ResolvedPerson,
  ResolvedPeople,
} from '../types';
import {
  FIELD_NAMES,
  CONTENT_TYPE_IDS,
  IMAGE_SUBFIELDS,
  PERSON_SUBFIELDS,
  MEDIA_LINK_SUBFIELDS,
  resolveImage,
  resolveMediaLink,
  resolveParentSlug,
  resolveEntryUrl,
  type ImageRole,
} from './conventions';
import { renderThumbnailUrl } from './kcrw';
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

  const title = ((fields[FIELD_NAMES.title] as string | undefined) ?? '').trim();
  const description = (fields[FIELD_NAMES.description] as string | undefined) ?? null;
  const corrections = (fields[FIELD_NAMES.corrections] as string | undefined) ?? null;
  const bylineDate = (fields[FIELD_NAMES.bylineDate] as string | undefined) ?? null;
  const bylineCount = (fields[FIELD_NAMES.bylineCount] as number | undefined) ?? 1;
  const body = (fields[FIELD_NAMES.body] as Document | undefined) ?? null;

  const imageLink = fields[FIELD_NAMES.image] as { sys: { id: string } } | undefined;
  const audioLink = fields[FIELD_NAMES.audioMedia] as { sys: { id: string } } | undefined;
  const videoLink = fields[FIELD_NAMES.videoMedia] as { sys: { id: string } } | undefined;

  const warnings: string[] = [];

  const hosts = resolvePeople(fields, FIELD_NAMES.hostsCollection, entriesById, warnings, 'host');
  const reporters = resolvePeople(fields, FIELD_NAMES.reportersCollection, entriesById, warnings, 'reporter');
  const producers = resolvePeople(fields, FIELD_NAMES.producersCollection, entriesById, warnings, 'producer');
  const guests = resolvePeople(fields, FIELD_NAMES.guestsCollection, entriesById, warnings, 'guest');
  const showTitle = resolveFirstCollectionTitle(fields, FIELD_NAMES.showsCollection, entriesById, warnings, 'show');
  const categoryTitle = resolveFirstCollectionTitle(fields, FIELD_NAMES.categoriesCollection, entriesById, warnings, 'category');
  const leadImage = imageLink ? resolveImageEntry(imageLink.sys.id, entriesById, assetsById, warnings, 'Lead image', 'lead') : null;

  // Canonical URL: derive from the story's own slug + parent show/section.
  const slug = fields[FIELD_NAMES.slug] as string | undefined;
  const parentLookup = new Map(
    [...entriesById.entries()].map(([id, e]) => [id, { contentType: e.contentType, fields: e.fields }]),
  );
  const parent = resolveParentSlug(fields, 'Story', parentLookup);
  const canonicalUrl = resolveEntryUrl(
    { contentType: 'Story', slug, parentSlug: parent?.slug, parentContentType: parent?.contentType },
    params.canonicalUrlTemplate ?? '',
  );

  // Thumbnail: lead image re-sized to thumb width, or fall back to the show's image.
  let thumbnailUrl: string | null = null;
  if (leadImage) {
    thumbnailUrl = renderThumbnailUrl(leadImage);
  } else {
    const showItems = (fields[FIELD_NAMES.showsCollection] as { sys: { id: string } }[] | undefined) ?? [];
    const showId = showItems[0]?.sys?.id;
    const showEntry = showId ? entriesById.get(showId) : undefined;
    if (showEntry) {
      const showImageLink = showEntry.fields[FIELD_NAMES.image] as { sys: { id: string } } | undefined;
      if (showImageLink) {
        const showImage = resolveImageEntry(showImageLink.sys.id, entriesById, assetsById, warnings, 'Show image', 'thumb');
        thumbnailUrl = showImage ? renderThumbnailUrl(showImage) : null;
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

  const people: ResolvedPeople = { hosts, reporters, producers, guests };

  return {
    title,
    description,
    showTitle,
    people,
    bylineDate,
    bylineCount,
    categoryTitle,
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

function resolvePeople(
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
  const title = entry.fields[FIELD_NAMES.title] as string | undefined;
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

  const fields = { ...entry.fields };
  const assetLink = fields[IMAGE_SUBFIELDS.asset] as { sys?: { linkType?: string; id?: string } } | undefined;
  if (assetLink?.sys?.linkType === 'Asset' && assetLink.sys.id) {
    const asset = assetsById.get(assetLink.sys.id);
    if (!asset) {
      warnings.push(`${label} (entry ${id}) asset ${assetLink.sys.id} not found; article will publish without it.`);
      return null;
    }
    fields[IMAGE_SUBFIELDS.asset] = {
      sys: { id: asset.id },
      fields: { file: { url: asset.url, details: { image: { width: asset.width, height: asset.height } } } },
    };
  }

  const resolved = resolveImage(fields, role);
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
  const url = entry.fields[MEDIA_LINK_SUBFIELDS.mediaUrl] as string | undefined;
  if (!url) {
    warnings.push(`Audio media entry ${id} has no ${MEDIA_LINK_SUBFIELDS.mediaUrl}; article will publish without it.`);
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
  const url = entry.fields[MEDIA_LINK_SUBFIELDS.mediaUrl] as string | undefined;
  if (!url) {
    warnings.push(`Video media entry ${id} has no ${MEDIA_LINK_SUBFIELDS.mediaUrl}; article will publish without it.`);
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
  if (entry.contentType === CONTENT_TYPE_IDS.photo) {
    const fields = { ...entry.fields };
    const assetLink = fields[IMAGE_SUBFIELDS.asset] as { sys?: { linkType?: string; id?: string } } | undefined;
    if (assetLink?.sys?.linkType === 'Asset' && assetLink.sys.id) {
      const asset = assetsById.get(assetLink.sys.id);
      if (asset) {
        fields[IMAGE_SUBFIELDS.asset] = {
          sys: { id: asset.id },
          fields: { file: { url: asset.url, details: { image: { width: asset.width, height: asset.height } } } },
        };
      }
    }
    const image = resolveImage(fields, 'body');
    if (image) embedMap.set(id, { type: 'photo', ...image });
    else warnings.push(`Embedded photo entry ${id} could not be resolved; it will be omitted from the body.`);
  } else if (entry.contentType === CONTENT_TYPE_IDS.mediaLink) {
    const media = resolveMediaLink(entry.fields);
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

    const slug = entry.fields[FIELD_NAMES.slug] as string | undefined;
    const parent = resolveParentSlug(entry.fields, entry.contentType, lookup);
    const url = resolveEntryUrl(
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
  return [...new Set(ids)];
}
