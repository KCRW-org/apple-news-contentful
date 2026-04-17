// App configuration stored in Contentful installation parameters
export type AppInstallationParameters = {
  apiKeyId?: string;
  apiKeySecret?: string;
  channelId?: string;
  /** Contentful Content Delivery API token — used by App Actions to read published entries. */
  cdaToken?: string;
  /** Contentful Content Preview API token — used by the browser download preview to read draft entries. */
  cpaToken?: string;
  canonicalUrlTemplate?: string;
  locale?: string;
  articleCustomizationsJson?: string;
  /** JSON map of Contentful category entry ID → Apple News section ID. */
  sectionMappingJson?: string;
  footerText?: string;
};

// Apple News article processing state. See docs/apple-news-api.md "Article States".
export type AppleNewsState =
  | 'PROCESSING'
  | 'LIVE'
  | 'PROCESSING_UPDATE'
  | 'TAKEN_DOWN'
  | 'FAILED_PROCESSING'
  | 'FAILED_PROCESSING_UPDATE'
  | 'DUPLICATE';

/** State values where Apple News is still working — client should keep polling. */
export const PENDING_APPLE_NEWS_STATES: readonly AppleNewsState[] = [
  'PROCESSING',
  'PROCESSING_UPDATE',
];

/** Human-readable labels for Apple News article states. */
export const APPLE_NEWS_STATE_LABELS: Record<AppleNewsState, string> = {
  PROCESSING: 'Processing',
  PROCESSING_UPDATE: 'Processing update',
  LIVE: 'Live',
  TAKEN_DOWN: 'Taken down',
  FAILED_PROCESSING: 'Processing failed',
  FAILED_PROCESSING_UPDATE: 'Update processing failed',
  DUPLICATE: 'Duplicate',
};

// Stored as JSON in the entry's appleNewsData field
export type AppleNewsData = {
  id: string;
  revision: string;
  publishedAt: string;
  shareUrl: string;
  /** Last-known Apple News article state; refreshed via the refreshStatus action. */
  state?: AppleNewsState;
  /** When true, the article is a preview visible only to channel members, not the public. */
  isPreview?: boolean;
  /** The Contentful entry publishedVersion at the time this article was last sent to Apple News. */
  contentfulVersion?: number;
  /**
   * True immediately after the initial create, before Apple News confirms a final state.
   * Cleared on the first real state write from refreshStatus. When set, failure states
   * (FAILED_PROCESSING etc.) are written back to reflect that the article never went live.
   * For updates, failures are not written back — the article presumably remains unchanged.
   */
  isProvisional?: boolean;
  /** Article metadata options that were last sent to Apple News. */
  isCandidateToBeFeatured?: boolean;
  isSponsored?: boolean;
};

// App Action result types (returned from functions/appleNews.ts)
export type ActionConflict =
  | {
      /** The live Apple News state detected at action time. */
      liveState: AppleNewsState;
      /** The state we had stored in appleNewsData — undefined means we had no record of the state. */
      storedState?: AppleNewsState;
      /** True when the Apple News revision differs from what we last stored, indicating an external edit. */
      revisionChanged?: boolean;
      articleDeleted?: never;
    }
  | {
      /** The article no longer exists in Apple News (404). Confirming will publish a new article. */
      articleDeleted: true;
      liveState?: never;
      storedState?: never;
      revisionChanged?: never;
    };

export type PublishActionResult = {
  success: boolean;
  shareUrl?: string;
  data?: AppleNewsData;
  /** Non-fatal warnings from story resolution and publish (e.g. "Lead image missing", "Revision conflict auto-retried"). */
  warnings?: string[];
  error?: string;
  /** Set when the live Apple News state differs from our stored state and `confirmed` was not passed. */
  conflict?: ActionConflict;
};

export type DeleteActionResult = {
  success: boolean;
  error?: string;
  /** Set when the live Apple News state differs from our stored state and `confirmed` was not passed. */
  conflict?: ActionConflict;
};

export type CheckStatusResult = {
  published: boolean;
  shareUrl?: string;
  data?: AppleNewsData;
  /** Current Apple News state, when `refreshFromApple` was requested and succeeded. */
  state?: AppleNewsState;
  /** Non-fatal warnings returned by the Apple News API (from readArticle). */
  warnings?: string[];
  /** Populated when refreshFromApple was requested but failed. */
  error?: string;
};


// Resolved content shapes — no Contentful SDK types leak past fetch.ts
export type ResolvedImage = {
  /**
   * Contentful Asset ID, when resolvable. Used by download-preview to decide whether
   * the asset is published (remote URL is safe) or should be bundled into the zip.
   * Absent for sources where the asset ID can't be extracted from the entry's shape.
   */
  id?: string;
  url: string;
  width?: number;
  height?: number;
  altText?: string;
  caption?: string;
  credit?: string;
  /** Contentful focal-point hint from the photo entry. 'nocrop' → pad; any other value → fill focus point. */
  focusHint?: string | null;
};

export type ResolvedAudio = {
  url: string;
};

export type ResolvedVideo = {
  url: string; // YouTube URL
};

export type ResolvedMediaLink =
  | { type: 'youtube'; url: string }
  | { type: 'audio'; url: string };

export type ResolvedEmbed =
  | ({ type: 'photo' } & ResolvedImage)
  | ResolvedMediaLink;

/**
 * A resolved Person entry (hosts, reporters, producers, guests all share the same shape).
 * `slug` drives `resolveEntryUrl` for linking in the credits block; `title` is the per-person
 * role label shown in the guests list.
 */
export type ResolvedPerson = {
  id: string;
  name: string;
  title: string | null;
  slug: string | null;
};

/**
 * The four people collections the article format cares about. Kept as separate arrays
 * (not a flat list) so the byline prefix logic can branch on which collection supplied
 * the names and the credits block can label each group.
 */
export type ResolvedPeople = {
  hosts: ResolvedPerson[];
  reporters: ResolvedPerson[];
  producers: ResolvedPerson[];
  guests: ResolvedPerson[];
};

export type ResolvedStory = {
  title: string;
  description: string | null;  // shortDescription field
  /** First show's title (from showsCollection[0].title), rendered in all caps at the top. */
  showTitle: string | null;
  /** All resolved people, grouped by role. Used by both the byline line and the credits block. */
  people: ResolvedPeople;
  /** Raw ISO date string from the byline date field; formatted at render time. */
  bylineDate: string | null;
  /** Number of contributors to include in the byline; defaults to 1 if unset. */
  bylineCount: number;
  /** First category's title (from categoriesCollection[0].title), shown at the end of the byline. */
  categoryTitle: string | null;
  /** All linked category entry IDs — used to resolve Apple News sections from the config mapping. */
  categoryIds: string[];
  leadImage: ResolvedImage | null;
  /** Thumbnail URL for Apple News feed tiles — lead image at thumb size, or show image if no lead image. */
  thumbnailUrl: string | null;
  /** Canonical web URL for this article, used in ANF metadata.canonicalURL. */
  canonicalUrl: string | null;
  audio: ResolvedAudio | null;
  video: ResolvedVideo | null;
  body: import('@contentful/rich-text-types').Document | null;
  corrections: string | null;  // markdown text
  embedMap: Map<string, ResolvedEmbed>;    // entryId → resolved embed
  linkMap: Map<string, string | null>;     // entryId → canonical URL or null
  /**
   * Non-fatal issues encountered while resolving linked content — surfaced to the user
   * after publish rather than silently logged. Examples: deleted linked image, broken
   * media entry. An empty array means resolution was clean.
   */
  warnings: string[];
};

// ── conventions.ts / kcrw.ts shared types ────────────────────────────────────

/**
 * Image role — drives the target width applied via the Contentful Images API.
 * - 'lead':  top-of-article hero image
 * - 'body':  inline photo in the article body
 * - 'thumb': small embed / caption thumbnail
 */
export type ImageRole = 'lead' | 'body' | 'thumb';

export type AfterBodyContext = {
  story: ResolvedStory;
  canonicalUrlTemplate: string;
};

export type ResolvedParent = { slug: string; contentType: string };

export type ParentLookupEntry = {
  contentType: string;
  fields: Record<string, unknown>;
};

export type ArticleMetadata = {
  maturityRating?: string | null;
  isCandidateToBeFeatured?: boolean;
  isSponsored?: boolean;
};

export type EntryUrlInput = {
  contentType: string;
  slug?: string;
  parentSlug?: string;
  parentContentType?: string;
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
