/**
 * Port for fetching Contentful entries during story resolution.
 *
 * `createDeliveryEntrySource` — backed by the Contentful Delivery API (CDA) or
 * Content Preview API (CPA) via plain HTTP fetch.
 */

/**
 * A normalized entry shape used throughout fetch.ts.
 *
 * `fields` is already locale-resolved — callers read values with
 * `entry.fields[fieldName]` directly.
 * `contentType` is the content type ID (e.g. `"photo"`, `"story"`).
 */
export type SourcedEntry = {
  id: string;
  contentType: string;
  fields: Record<string, unknown>;
};

export type SourcedEntryBundle = {
  entry: SourcedEntry | null;
  /** All entries in the response (root + includes.Entry), keyed by id. */
  entriesById: Map<string, SourcedEntry>;
  /** All assets in includes.Asset, keyed by id. */
  assetsById: Map<string, SourcedAsset>;
};

/**
 * A normalized asset shape — fields are already locale-resolved.
 * Mirrors the subset of the CDA asset response used by resolveAssetInfo.
 */
export type SourcedAsset = {
  id: string;
  url: string;
  width: number | undefined;
  height: number | undefined;
};

export interface EntrySource {
  /** Fetch a single entry by id. Returns null if not found. */
  getEntry(id: string): Promise<SourcedEntry | null>;
  /**
   * Fetch an entry and all entries reachable within `include` levels.
   * Used for the main story resolution and for hyperlink parent-slug chains.
   */
  getEntryWithIncludes(id: string, include: number): Promise<SourcedEntryBundle>;
  /** Fetch a Contentful asset by id. Returns null if not found. */
  getAsset(id: string): Promise<SourcedAsset | null>;
}

// ── Delivery API (CDA / CPA) EntrySource ─────────────────────────────────────

type CdaEntry = {
  sys: { id: string; contentType: { sys: { id: string } } };
  fields: Record<string, unknown>;
};

type CdaAsset = {
  sys: { id: string };
  fields: {
    file?: { url?: string; details?: { image?: { width?: number; height?: number } } };
  };
};

type CdaCollectionResponse = {
  items: CdaEntry[];
  includes?: { Entry?: CdaEntry[]; Asset?: CdaAsset[] };
};

/**
 * Creates an EntrySource backed by the Contentful Delivery API (CDA) or
 * Content Preview API (CPA) via plain HTTP fetch.
 *
 * Default (`baseUrl` omitted): CDA (`cdn.contentful.com`) — published entries only.
 * Pass `baseUrl: 'https://preview.contentful.com'` for CPA (draft-inclusive).
 */
export function createDeliveryEntrySource(config: {
  baseUrl?: string;
  token: string;
  spaceId: string;
  environmentId: string;
  locale: string;
}): EntrySource {
  const { token, spaceId, environmentId, locale } = config;
  const baseUrl = (config.baseUrl ?? 'https://cdn.contentful.com').replace(/\/$/, '');
  const root = `${baseUrl}/spaces/${spaceId}/environments/${environmentId}`;
  const headers = { Authorization: `Bearer ${token}` };

  async function apiFetch<T>(url: string): Promise<T | null> {
    const resp = await fetch(url, { headers });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      throw new Error(`Contentful Delivery API error ${resp.status} fetching ${url}`);
    }
    return resp.json() as Promise<T>;
  }

  function normalizeEntry(e: CdaEntry): SourcedEntry {
    return { id: e.sys.id, contentType: e.sys.contentType.sys.id, fields: e.fields };
  }

  function normalizeAsset(a: CdaAsset): SourcedAsset | null {
    const file = a.fields.file;
    if (!file?.url) return null;
    const url = file.url.startsWith('//') ? `https:${file.url}` : file.url;
    return { id: a.sys.id, url, width: file.details?.image?.width, height: file.details?.image?.height };
  }

  return {
    async getEntry(id) {
      const data = await apiFetch<CdaEntry>(`${root}/entries/${encodeURIComponent(id)}?locale=${locale}`);
      return data ? normalizeEntry(data) : null;
    },
    async getAsset(id) {
      const data = await apiFetch<CdaAsset>(`${root}/assets/${encodeURIComponent(id)}?locale=${locale}`);
      return data ? normalizeAsset(data) : null;
    },
    async getEntryWithIncludes(id, include) {
      // `include` only works on the collection endpoint — the single-entry endpoint
      // ignores it and never returns includes.
      const data = await apiFetch<CdaCollectionResponse>(
        `${root}/entries?sys.id=${encodeURIComponent(id)}&include=${include}&locale=${locale}`,
      );
      if (!data || data.items.length === 0) {
        return { entry: null, entriesById: new Map(), assetsById: new Map() };
      }
      const entry = normalizeEntry(data.items[0]);
      const entriesById = new Map<string, SourcedEntry>();
      const assetsById = new Map<string, SourcedAsset>();
      entriesById.set(entry.id, entry);
      for (const inc of data.includes?.Entry ?? []) {
        const sourced = normalizeEntry(inc);
        entriesById.set(sourced.id, sourced);
      }
      for (const asset of data.includes?.Asset ?? []) {
        const sourced = normalizeAsset(asset);
        if (sourced) assetsById.set(sourced.id, sourced);
      }
      return { entry, entriesById, assetsById };
    },
  };
}
