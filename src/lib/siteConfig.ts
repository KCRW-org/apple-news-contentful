import type {
  AnfComponent,
  AfterBodyContext,
  ArticleMetadata,
  EntryUrlInput,
  ImageRole,
  ParentLookupEntry,
  ResolvedImage,
  ResolvedMediaLink,
  ResolvedParent,
  ResolvedPeople,
  ResolvedStory,
} from '../types';
import type { SourcedAsset, SourcedEntry } from './entrySource';

export interface FieldNameConfig {
  title: string;
  slug: string;
  body: string;
  description: string;
  image: string;
  bylineDate: string;
  bylineCount: string;
  corrections: string;
  audioMedia: string;
  videoMedia: string;
  appleNewsData: string;
  showsCollection: string;
  categoriesCollection: string;
}

export interface ContentTypeIdConfig {
  story: string;
  photo: string;
  mediaLink: string;
}

export type AnfDocumentBase = {
  version: string;
  layout: Record<string, unknown>;
  documentStyle: Record<string, unknown>;
  textStyles: Record<string, unknown>;
  componentTextStyles: Record<string, unknown>;
  componentStyles: Record<string, unknown>;
  componentLayouts: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export interface SiteConfig {
  fieldNames: FieldNameConfig;
  contentTypeIds: ContentTypeIdConfig;

  renderImageUrl(sourceUrl: string, role: ImageRole): string;
  resolveImage(
    fields: Record<string, unknown>,
    role: ImageRole,
    assetsById?: Map<string, SourcedAsset>,
  ): ResolvedImage | null;
  renderThumbnailUrl(image: ResolvedImage): string;

  resolveMediaLink(fields: Record<string, unknown>): ResolvedMediaLink | null;

  resolvePeople(
    fields: Record<string, unknown>,
    entriesById: Map<string, SourcedEntry>,
    warnings: string[],
  ): ResolvedPeople;
  formatByline(
    people: ResolvedPeople,
    date: string | null,
    categoryTitle: string | null,
    bylineCount: number,
  ): string | null;
  authorNames(people: ResolvedPeople, bylineCount: number): string[];

  resolveParentSlug(
    fields: Record<string, unknown>,
    entryContentType: string,
    entriesById?: Map<string, ParentLookupEntry>,
  ): ResolvedParent | undefined;
  resolveEntryUrl(
    entry: EntryUrlInput,
    canonicalUrlTemplate: string,
  ): string | null;

  renderAfterBody(ctx: AfterBodyContext): AnfComponent[];
  resolveArticleMetadata(story: ResolvedStory): ArticleMetadata;
  articleBase: AnfDocumentBase;
}
