import type { AnfComponent, AnfDocument, AppInstallationParameters, ResolvedStory } from '../types';
import { richTextToComponents } from './richText';

// ── Article base (mirrored from kcrw.plone_apple_news/templates.py) ──────────

const ARTICLE_BASE = {
  version: '1.7',
  layout: { columns: 12, width: 1280, margin: 60, gutter: 20 },
  documentStyle: { backgroundColor: '#FFFFFF' },
  textStyles: {
    'class-style-discreet': { textColor: '#86868B', fontSize: 14 },
    'style-underline': { underline: true },
  },
  componentTextStyles: {
    default: { fontName: 'Helvetica', fontSize: 18, lineHeight: 25, linkStyle: { textColor: '#1D1D1F' } },
    'default-title': { fontSize: 45, lineHeight: 48, fontName: 'Verdana-Bold', hyphenation: false },
    'default-intro': { fontSize: 20 },
    'default-byline': { fontSize: 14, hyphenation: false, textColor: '#86868B' },
    'default-body': { hyphenation: true, paragraphSpacingAfter: 18, paragraphSpacingBefore: 18 },
    'default-caption': { fontSize: 14, textAlignment: 'center', textColor: '#86868B' },
    'body-container': {},
    'body-section': {},
    'body-section-first': {},
    'body-section-last': {},
    'footer-section': {},
    'footer-section-first': {},
    'footer-section-last': {},
  },
  componentStyles: {
    headerStyle: {}, titleStyle: {}, subheadStyle: {}, bylineStyle: {},
    leadPhotoContainerStyle: {}, leadPhotoStyle: {}, leadPhotoCaptionStyle: {},
    bodyStyle: {}, bodyHeadingStyle: {}, bodyHeadingWithBorderStyle: {},
    bodyPhotoStyle: {}, bodyPhotoInsetStyle: {}, bodyPhotoContainerStyle: {},
    captionStyle: {}, bodyImageStyle: {}, bodyVideoEmbedStyle: {},
    headerAudioStyle: {}, headerVideoStyle: {}, bodyAudioEmbedStyle: {},
    footerStyle: {},
  },
  componentLayouts: {
    headerLayout: { margin: { top: 20, bottom: 20 } },
    titleLayout: {},
    subheadLayout: { margin: { top: 5 } },
    bylineLayout: {},
    leadPhotoContainer: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { bottom: 10 } },
    leadPhoto: { ignoreViewportPadding: true, ignoreDocumentMargin: true },
    leadPhotoCaptionLayout: { ignoreViewportPadding: true, ignoreDocumentMargin: true, margin: { top: 2, bottom: 2 } },
    bodyLayout: { margin: { top: 20, bottom: 40 } },
    imageLeft: { columnStart: 0, columnSpan: 4, padding: { top: 0, right: 5, bottom: 10, left: 0 } },
    imageRight: { columnStart: 8, columnSpan: 4, padding: { top: 0, right: 0, bottom: 10, left: 5 } },
    bodyHeading: { margin: { top: 10, bottom: 10 } },
    bodyPhoto: { columnStart: 1, columnSpan: 10, margin: { top: 20, bottom: 20 } },
    captionLayout: { padding: { top: 2, bottom: 2 } },
    bodyImage: {},
    bodyVideoEmbed: { margin: { top: 20, bottom: 20 } },
    headerAudioLayout: { margin: { top: 20, bottom: 20 } },
    headerVideoLayout: { margin: { top: 20, bottom: 20 } },
    bodyAudioEmbed: { margin: { top: 20, bottom: 20 } },
    footerLayout: { margin: { top: 10, bottom: 40 } },
  },
  metadata: {
    generatorName: 'Apple News Contentful',
    generatorVersion: '0.1.0',
  },
};

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

  let doc: AnfDocument = {
    ...base,
    version: ARTICLE_BASE.version,
    identifier: entryId,
    title: story.title,
    language: 'en-US',
    components,
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

  // 1. Header container: title → intro → byline
  const headerChildren: AnfComponent[] = [];
  headerChildren.push({ role: 'title', text: story.title, layout: 'titleLayout', style: 'titleStyle' });
  if (story.description) {
    headerChildren.push({ role: 'intro', text: story.description, layout: 'subheadLayout', style: 'subheadStyle' });
  }
  if (story.byline) {
    headerChildren.push({ role: 'body', text: story.byline, layout: 'bylineLayout', style: 'bylineStyle' });
  }
  components.push({ role: 'container', layout: 'headerLayout', style: 'headerStyle', components: headerChildren });

  // 2. Lead photo (with optional caption container)
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
          { role: 'caption', text: captionText, layout: 'leadPhotoCaptionLayout', style: 'leadPhotoCaptionStyle' },
        ],
      };
      components.push(captionContainer);
    } else {
      photoComponent.layout = 'leadPhotoContainer';
      photoComponent.style = 'leadPhotoStyle';
      components.push(photoComponent);
    }
  }

  // 3. Top-level audio (if present)
  if (story.audio) {
    components.push({
      role: 'audio',
      audioURL: story.audio.url,
      layout: 'headerAudioLayout',
      style: 'headerAudioStyle',
    });
  }

  // 4. Top-level video (if present)
  if (story.video) {
    components.push({
      role: 'embedwebvideo',
      URL: story.video.url,
      layout: 'headerVideoLayout',
      style: 'headerVideoStyle',
    });
  }

  // 5. Body section (rich text)
  if (story.body) {
    const bodyComponents = richTextToComponents(story.body, story.embedMap, story.linkMap);
    components.push(...bodyComponents);
  }

  // 6. Corrections section (after body)
  if (story.corrections) {
    components.push({
      role: 'body',
      identifier: 'corrections',
      text: `<p><strong>Correction:</strong> ${escapeHtml(story.corrections)}</p>`,
      format: 'html',
      layout: 'bodyLayout',
      style: 'bodyStyle',
    });
  }

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

/**
 * Recursively deep-merges `source` into `target`.
 * Arrays in `source` replace arrays in `target` (no concatenation).
 * Exported for testing.
 */
export function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      result[key] = mergeDeep(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
