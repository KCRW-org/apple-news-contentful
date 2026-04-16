/**
 * Port for fetching Contentful entries during story resolution.
 *
 * Two implementations:
 *
 * `createCmaEntrySource` — backed by the CMA PlainClientAPI. The CMA management
 * API returns ALL fields regardless of their "Omit from API responses" delivery
 * setting, which makes it the only reliable choice for content models that mark
 * collection reference fields as omitted. `publishedOnly: true` (default) filters
 * out unpublished entries and fetches the published version for any linked entry
 * that has pending draft changes, so draft content never leaks into articles.
 *
 * `createDeliveryEntrySource` — backed by the Contentful Delivery API (CDA) or
 * Content Preview API (CPA) via plain HTTP fetch. Simpler, but only returns fields
 * that are NOT marked "Omit from API responses" in the content type editor. Use
 * only when you know all needed fields are delivery-API-visible.
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
 * Mirrors the subset of the CMA/CDA asset response used by resolveAssetInfo.
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

// ── CMA-backed EntrySource ──────────────────────────────────────────────────

type CmaAsset = {
  sys: { id: string; publishedVersion?: number };
  fields: {
    file?: Record<string, { url?: string; details?: { image?: { width?: number; height?: number } } } | undefined>;
  };
};

export type CmaPlainClient = {
  entry: {
    get(params: {
      spaceId: string;
      environmentId: string;
      entryId: string;
    }): Promise<CmaEntry>;
    getPublished(params: {
      spaceId: string;
      environmentId: string;
      query: Record<string, string | number>;
    }): Promise<{ items: CmaEntry[] }>;
    references(params: {
      spaceId: string;
      environmentId: string;
      entryId: string;
      include?: number;
    }): Promise<{ includes?: { Entry?: CmaEntry[]; Asset?: CmaAsset[] }; items: CmaEntry[] }>;
  };
  asset: {
    get(params: {
      spaceId: string;
      environmentId: string;
      assetId: string;
    }): Promise<CmaAsset>;
    getPublished(params: {
      spaceId: string;
      environmentId: string;
      query: Record<string, string | number>;
    }): Promise<{ items: CmaAsset[] }>;
  };
};

type CmaEntry = {
  sys: { id: string; contentType: { sys: { id: string } }; publishedVersion?: number; version?: number };
  fields: Record<string, Record<string, unknown>>;
};

/** Unwraps CMA locale-wrapped fields (`fields[name][locale]`) into flat `fields[name]`. */
function unwrapLocale(entry: CmaEntry, locale: string): SourcedEntry {
  const flat: Record<string, unknown> = {};
  for (const [key, locales] of Object.entries(entry.fields)) {
    flat[key] = locales?.[locale];
  }
  return {
    id: entry.sys.id,
    contentType: entry.sys.contentType.sys.id,
    fields: flat,
  };
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { sys?: { id?: string }; response?: { status?: number } });
  return status.sys?.id === 'NotFound' || status.response?.status === 404;
}

/**
 * Creates an EntrySource backed by the CMA PlainClientAPI.
 *
 * The CMA returns ALL fields regardless of their "Omit from API responses" delivery
 * setting, making it the right choice for KCRW's content model where collection
 * reference fields (hostsCollection, showsCollection, etc.) are omitted from the
 * delivery API but must be resolved for article building.
 *
 * `publishedOnly: true` (default):
 *   - `getEntry` / `getAsset`: reads via `getPublished` — guaranteed published values.
 *   - `getEntryWithIncludes`: uses `entry.references()` to get the full entry tree
 *     (following all link fields including omitted ones), then filters to published
 *     entries only. For any linked entry that has pending draft changes
 *     (`version > publishedVersion + 1`), its published field values are fetched
 *     separately via `getPublished` so draft content never leaks into articles.
 *
 * `publishedOnly: false`:
 *   - All methods read the current version (draft + published). Used by preview and
 *     export flows where editors want to see unpublished changes.
 */
export function createCmaEntrySource(
  cma: CmaPlainClient,
  spaceId: string,
  environmentId: string,
  locale: string,
  opts?: { publishedOnly?: boolean },
): EntrySource {
  const publishedOnly = opts?.publishedOnly !== false;

  async function getPublishedEntry(id: string): Promise<SourcedEntry | null> {
    const response = await cma.entry.getPublished({
      spaceId,
      environmentId,
      query: { 'sys.id': id, limit: 1 },
    });
    const entry = response.items[0];
    return entry ? unwrapLocale(entry, locale) : null;
  }

  return {
    async getEntry(id) {
      try {
        if (publishedOnly) {
          return await getPublishedEntry(id);
        }
        const entry = await cma.entry.get({ spaceId, environmentId, entryId: id });
        return unwrapLocale(entry, locale);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async getAsset(id) {
      try {
        let asset: CmaAsset;
        if (publishedOnly) {
          const response = await cma.asset.getPublished({
            spaceId,
            environmentId,
            query: { 'sys.id': id, limit: 1 },
          });
          const item = response.items[0];
          if (!item) return null;
          asset = item;
        } else {
          asset = await cma.asset.get({ spaceId, environmentId, assetId: id });
        }
        const file = asset.fields.file?.[locale];
        if (!file?.url) return null;
        return {
          id: asset.sys.id,
          url: file.url,
          width: file.details?.image?.width,
          height: file.details?.image?.height,
        };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async getEntryWithIncludes(id, include) {
      // `entry.references()` follows ALL link fields including those marked "Omit from
      // API responses" in the content type editor — essential for KCRW's content model.
      const refResponse = await cma.entry.references({
        spaceId,
        environmentId,
        entryId: id,
        include,
      });

      const isPublishedAsset = (a: CmaAsset) => !publishedOnly || a.sys.publishedVersion != null;

      const root = refResponse.items[0];
      const rootPublished = !publishedOnly || root?.sys.publishedVersion != null;
      const entry = (root && rootPublished) ? unwrapLocale(root, locale) : null;
      const entriesById = new Map<string, SourcedEntry>();
      const assetsById = new Map<string, SourcedAsset>();

      if (entry) entriesById.set(entry.id, entry);

      // For each linked entry: include only published ones. If an entry has pending
      // draft changes (version > publishedVersion + 1), fetch its published field
      // values separately so we never send draft content to Apple News.
      const draftFetches: Promise<void>[] = [];
      for (const inc of refResponse.includes?.Entry ?? []) {
        if (!publishedOnly || inc.sys.publishedVersion != null) {
          const hasDraftChanges =
            publishedOnly &&
            inc.sys.version != null &&
            inc.sys.publishedVersion != null &&
            inc.sys.version > inc.sys.publishedVersion + 1;

          if (hasDraftChanges) {
            // Fetch published version asynchronously to avoid serial round-trips.
            draftFetches.push(
              getPublishedEntry(inc.sys.id).then(published => {
                if (published) entriesById.set(published.id, published);
              }).catch(() => {
                // Non-fatal: fall back to the references() values (might have draft fields).
                const sourced = unwrapLocale(inc, locale);
                entriesById.set(sourced.id, sourced);
              }),
            );
          } else {
            const sourced = unwrapLocale(inc, locale);
            entriesById.set(sourced.id, sourced);
          }
        }
      }

      if (draftFetches.length > 0) await Promise.all(draftFetches);

      for (const asset of refResponse.includes?.Asset ?? []) {
        if (isPublishedAsset(asset)) {
          const file = asset.fields.file?.[locale];
          if (file?.url) {
            assetsById.set(asset.sys.id, {
              id: asset.sys.id,
              url: file.url,
              width: file.details?.image?.width,
              height: file.details?.image?.height,
            });
          }
        }
      }
      return { entry, entriesById, assetsById };
    },
  };
}

// ── Delivery API (CDA / CPA) EntrySource ─────────────────────────────────────
//
// Use only when you know all needed fields are NOT marked "Omit from API
// responses" in the Contentful content type editor. The CDA/CPA respects that
// flag and won't return omitted fields or follow their links for includes.

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
 *
 * CAUTION: fields marked "Omit from API responses" in Contentful are invisible to
 * both CDA and CPA. If your content model uses omitted reference fields, use
 * `createCmaEntrySource` instead.
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
