import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type { Document, Block, Inline, Text, TopLevelBlock } from '@contentful/rich-text-types';
import type { AnfComponent, ResolvedEmbed } from '../types';
import { escapeHtml, escapeAttr } from './utilities';

/**
 * Converts a Contentful Rich Text Document to an array of ANF components.
 * Consecutive text blocks are batched into a single body component.
 * Embedded photo/video/audio entries become separate ANF components.
 *
 * Handling of unavailable linked content (deleted, archived, invalid — whatever the reason
 * `fetch.ts` couldn't resolve it, so it's missing from `embedMap`/`linkMap`):
 *   - Inline hyperlink (external or entry): drop the anchor, keep the link text.
 *   - Inline embedded entry: omit silently.
 *   - Block-level embedded entry: omit. (Emitting an empty placeholder paragraph would risk
 *     Apple News rejecting the document with an INVALID_DOCUMENT error for a paragraph with
 *     no text content.)
 */
export function richTextToComponents(
  doc: Document,
  embedMap: Map<string, ResolvedEmbed>,
  linkMap: Map<string, string | null>,
): AnfComponent[] {
  type RichTextItem =
    | { kind: 'text'; blocks: TopLevelBlock[] }
    | { kind: 'embed'; id: string }
    | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
    | { kind: 'quote'; text: string }
    | { kind: 'divider' };

  // First pass: group top-level nodes into text batches and embeds.
  // BLOCKS.QUOTE and BLOCKS.HR break the text batch and emit their own items.
  // A block-level embedded entry whose target didn't resolve is skipped entirely —
  // adjacent text batches will split around it (that split is harmless; the warning
  // comes from fetch.ts).
  const items: RichTextItem[] = [];
  let currentTextBatch: TopLevelBlock[] = [];

  const flushTextBatch = () => {
    if (currentTextBatch.length > 0) {
      items.push({ kind: 'text', blocks: currentTextBatch });
      currentTextBatch = [];
    }
  };

  for (const node of doc.content) {
    if (node.nodeType === BLOCKS.EMBEDDED_ENTRY) {
      const embeddedNode = node as Block & { data: { target: { sys: { id: string } } } };
      const id = embeddedNode.data.target.sys.id;
      if (embedMap.has(id)) {
        flushTextBatch();
        items.push({ kind: 'embed', id });
      }
      // else: target unavailable — omit and let the surrounding text flow continue.
    } else if (node.nodeType === BLOCKS.HEADING_1) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 1, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.HEADING_2) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 2, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.HEADING_3) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 3, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.HEADING_4) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 4, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.HEADING_5) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 5, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.HEADING_6) {
      flushTextBatch();
      items.push({ kind: 'heading', level: 6, text: inlinesToHtml((node as Block).content, linkMap) });
    } else if (node.nodeType === BLOCKS.QUOTE) {
      flushTextBatch();
      const text = (node as Block).content
        .map(child => inlinesToHtml((child as Block).content, linkMap))
        .join('');
      items.push({ kind: 'quote', text });
    } else if (node.nodeType === BLOCKS.HR) {
      flushTextBatch();
      items.push({ kind: 'divider' });
    } else if (node.nodeType !== BLOCKS.EMBEDDED_ASSET) {
      currentTextBatch.push(node as TopLevelBlock);
    }
  }
  if (currentTextBatch.length > 0) {
    items.push({ kind: 'text', blocks: currentTextBatch });
  }

  // Second pass: emit ANF components, assign section IDs and anchors
  const components: AnfComponent[] = [];
  let sectionIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'text') {
      sectionIndex++;
      const id = `body-section-${sectionIndex}`;
      const html = item.blocks.map(b => nodeToHtml(b, linkMap)).join('');
      components.push({
        role: 'body',
        identifier: id,
        text: html,
        format: 'html',
        layout: 'bodyLayout',
        style: 'bodyStyle',
        textStyle: 'default-body',
      });
    } else if (item.kind === 'heading') {
      components.push({
        role: `heading${item.level}`,
        text: item.text,
        format: 'html',
        layout: 'bodyHeading',
        style: 'bodyHeadingStyle',
        textStyle: `default-heading${item.level}`,
      });
    } else if (item.kind === 'quote') {
      components.push({
        role: 'pullquote',
        text: item.text,
        format: 'html',
        layout: 'pullquoteLayout',
        style: 'pullquoteStyle',
        textStyle: 'default-pullquote',
      });
    } else if (item.kind === 'divider') {
      components.push({
        role: 'divider',
        layout: 'headerDividerLayout',
        stroke: { color: '#D2D2D7', width: 1 },
      });
    } else {
      // Embed — we only reach this branch for entries that resolved successfully
      // (the first pass filtered out unavailable targets into empty paragraphs),
      // so embedMap.get is guaranteed to return a value here.
      const nextItem = items[i + 1];
      const hasFollowingText = nextItem?.kind === 'text';
      const anchor = hasFollowingText ? `body-section-${sectionIndex + 1}` : undefined;
      const embed = embedMap.get(item.id);
      if (!embed) continue; // defensive — shouldn't happen after the first-pass filter
      const component = embedToComponent(embed, anchor);
      if (component) components.push(component);
    }
  }

  return components;
}

function embedToComponent(
  embed: ResolvedEmbed,
  anchor: string | undefined,
): AnfComponent | null {
  if (embed.type === 'photo') {
    const c: AnfComponent = {
      role: 'photo',
      URL: embed.url,
      layout: 'bodyPhoto',
      style: 'bodyPhotoStyle',
    };
    if (anchor) c.anchor = { targetAnchorPosition: 'top', targetComponentIdentifier: anchor };
    if (embed.altText) c.accessibilityCaption = embed.altText;
    if (embed.caption || embed.credit) {
      c.caption = {
        text: [embed.caption, embed.credit].filter(Boolean).join(' — '),
        textStyle: 'default-caption',
      };
    }
    return c;
  }

  if (embed.type === 'youtube') {
    const c: AnfComponent = {
      role: 'embedwebvideo',
      URL: embed.url,
      layout: 'bodyVideoEmbed',
      style: 'bodyVideoEmbedStyle',
    };
    if (anchor) c.anchor = { targetAnchorPosition: 'top', targetComponentIdentifier: anchor };
    return c;
  }

  if (embed.type === 'audio') {
    const c: AnfComponent = {
      role: 'audio',
      URL: embed.url,
      layout: 'bodyAudioEmbed',
      style: 'bodyAudioEmbedStyle',
    };
    if (anchor) c.anchor = { targetAnchorPosition: 'top', targetComponentIdentifier: anchor };
    return c;
  }

  return null;
}

/**
 * Renders a single rich text Block node to an HTML string.
 * Exported for testing.
 */
export function nodeToHtml(
  node: Block | Inline,
  linkMap: Map<string, string | null>,
): string {
  switch (node.nodeType) {
    case BLOCKS.PARAGRAPH:
      return `<p>${inlinesToHtml(node.content, linkMap)}</p>`;
    case BLOCKS.UL_LIST:
      return `<ul>${node.content.map(li => `<li>${listItemInner(li as Block, linkMap)}</li>`).join('')}</ul>`;
    case BLOCKS.OL_LIST:
      return `<ol>${node.content.map(li => `<li>${listItemInner(li as Block, linkMap)}</li>`).join('')}</ol>`;
    default:
      // Unrecognized block — render children as a paragraph
      return `<p>${inlinesToHtml(node.content, linkMap)}</p>`;
  }
}

function listItemInner(li: Block, linkMap: Map<string, string | null>): string {
  const children = li.content as Block[];
  if (children.length === 1 && children[0].nodeType === BLOCKS.PARAGRAPH) {
    return inlinesToHtml(children[0].content, linkMap);
  }
  return children.map(c => nodeToHtml(c as Block, linkMap)).join('');
}

function inlinesToHtml(
  nodes: (Block | Inline | Text)[],
  linkMap: Map<string, string | null>,
): string {
  return nodes.map(node => inlineToHtml(node, linkMap)).join('');
}

function inlineToHtml(
  node: Block | Inline | Text,
  linkMap: Map<string, string | null>,
): string {
  if (node.nodeType === 'text') {
    const text = node as Text;
    let s = escapeHtml(text.value);
    for (const mark of text.marks) {
      if (mark.type === 'bold') s = `<strong>${s}</strong>`;
      else if (mark.type === 'italic') s = `<em>${s}</em>`;
      else if (mark.type === 'underline') s = `<span data-anf-textstyle="style-underline">${s}</span>`;
      else if (mark.type === 'code') s = `<code>${s}</code>`;
    }
    return s;
  }

  if (node.nodeType === INLINES.HYPERLINK) {
    const inline = node as Inline;
    const href = (inline.data as { uri?: string }).uri ?? '';
    const inner = inlinesToHtml(inline.content as (Block | Inline | Text)[], linkMap);
    return href ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
  }

  if (node.nodeType === INLINES.ENTRY_HYPERLINK) {
    const inline = node as Inline;
    const id = (inline.data as { target?: { sys?: { id?: string } } }).target?.sys?.id ?? '';
    const inner = inlinesToHtml(inline.content as (Block | Inline | Text)[], linkMap);
    const url = linkMap.get(id);
    return url ? `<a href="${escapeAttr(url)}">${inner}</a>` : inner;
  }

  // Embedded inline or unknown — skip
  return '';
}

