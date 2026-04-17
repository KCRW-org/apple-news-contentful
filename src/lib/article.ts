import type { AnfComponent, AnfDocument, AppInstallationParameters, ResolvedStory } from '../types';
import { richTextToComponents } from './richText';
import { formatByline, authorNames, renderAfterBody, ARTICLE_BASE } from './conventions';
import { mergeDeep, stripMarkdown } from './utilities';

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a complete ANF document from a resolved story.
 * `entryId` becomes the article's `identifier`.
 */
export function buildArticle(
  entryId: string,
  story: ResolvedStory,
  params: AppInstallationParameters,
): AnfDocument {
  const base = mergeDeep({}, ARTICLE_BASE as unknown as Record<string, unknown>) as typeof ARTICLE_BASE;
  const components: AnfComponent[] = buildComponents(story, params);

  const metadata: Record<string, unknown> = { ...((base.metadata ?? {}) as object) };
  if (story.description) metadata.excerpt = stripMarkdown(story.description);
  if (story.thumbnailUrl) metadata.thumbnailURL = story.thumbnailUrl;
  if (story.canonicalUrl) metadata.canonicalURL = story.canonicalUrl;
  const authors = authorNames(story.people, story.bylineCount);
  if (authors.length > 0) metadata.authors = authors;

  let doc: AnfDocument = {
    ...base,
    version: ARTICLE_BASE.version,
    identifier: entryId,
    title: story.title,
    language: 'en-US',
    components,
    metadata,
  };

  // Apply articleCustomizationsJson deep-merge
  if (params.articleCustomizationsJson) {
    try {
      const overrides = JSON.parse(params.articleCustomizationsJson) as Record<string, unknown>;
      doc = mergeDeep(doc as unknown as Record<string, unknown>, overrides) as unknown as AnfDocument;
    } catch {
      // ignore invalid JSON
    }
  }

  return doc;
}

function buildComponents(story: ResolvedStory, params: AppInstallationParameters): AnfComponent[] {
  const components: AnfComponent[] = [];

  // 1. Header container: show title (eyebrow) → title → intro → byline.
  // The show title is pre-uppercased here so styling has to actively undo it rather than
  // having to apply textTransform that a customization could inadvertently override.
  const headerChildren: AnfComponent[] = [];
  if (story.showTitle) {
    headerChildren.push({
      role: 'body',
      text: story.showTitle,
      layout: 'showTitleLayout',
      style: 'showTitleStyle',
      textStyle: 'default-show-title',
    });
  }
  headerChildren.push({ role: 'title', text: story.title, layout: 'titleLayout', style: 'titleStyle' });
  const bylineText = formatByline(story.people, story.bylineDate, story.categoryTitle, story.bylineCount);
  if (bylineText) {
    headerChildren.push({ role: 'byline', text: bylineText, layout: 'bylineLayout', style: 'bylineStyle' });
  }
  components.push({ role: 'container', layout: 'headerLayout', style: 'headerStyle', components: headerChildren });

  // 2. Top-level audio (if present) — before lead image so the player sits close to the byline.
  if (story.audio) {
    components.push({
      role: 'audio',
      URL: story.audio.url,
      layout: 'headerAudioLayout',
      style: 'headerAudioStyle',
    });
  }

  // 3. Top-level video (if present)
  if (story.video) {
    components.push({
      role: 'embedwebvideo',
      URL: story.video.url,
      layout: 'headerVideoLayout',
      style: 'headerVideoStyle',
    });
  }

  // 4. Lead photo (with optional caption container)
  if (story.leadImage) {
    const photoComponent: AnfComponent = {
      role: 'photo',
      URL: story.leadImage.url,
      layout: 'leadPhoto',
      style: 'leadPhotoStyle',
    };
    if (story.leadImage.altText) photoComponent.accessibilityCaption = story.leadImage.altText;

    if (story.leadImage.caption || story.leadImage.credit) {
      const captionText = [story.leadImage.caption, story.leadImage.credit].filter(Boolean).join(' — ');
      const captionContainer: AnfComponent = {
        role: 'container',
        layout: 'leadPhotoContainer',
        style: 'leadPhotoContainerStyle',
        components: [
          photoComponent,
          { role: 'caption', text: captionText, layout: 'leadPhotoCaptionLayout', style: 'leadPhotoCaptionStyle', textStyle: 'default-caption' },
        ],
      };
      components.push(captionContainer);
    } else {
      photoComponent.layout = 'leadPhotoContainer';
      photoComponent.style = 'leadPhotoStyle';
      components.push(photoComponent);
    }
  }

  // 5. Body section (rich text)
  if (story.body) {
    const bodyComponents = richTextToComponents(story.body, story.embedMap, story.linkMap);
    components.push(...bodyComponents);
  }

  // 6. After-body content (credits, corrections; hook for future additions).
  components.push(...renderAfterBody({ story, canonicalUrlTemplate: params.canonicalUrlTemplate ?? '' }));

  // 7. Footer
  if (params.footerText) {
    components.push({
      role: 'body',
      text: params.footerText,
      layout: 'footerLayout',
      style: 'footerStyle',
    });
  }

  return components;
}
