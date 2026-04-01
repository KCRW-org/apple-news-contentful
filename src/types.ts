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
