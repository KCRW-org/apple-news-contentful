import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import type { Document, Block, Inline, Text, TopLevelBlock } from '@contentful/rich-text-types';
import type { AnfComponent, ResolvedEmbed } from '../types';

/**
 * Converts a Contentful Rich Text Document to an array of ANF components.
 * Consecutive text blocks are batched into a single body component.
 * Embedded photo/video/audio entries become separate ANF components.
 */
export function richTextToComponents(
  doc: Document,
  embedMap: Map<string, ResolvedEmbed>,
  linkMap: Map<string, string | null>,
): AnfComponent[] {
  type RichTextItem =
    | { kind: 'text'; blocks: TopLevelBlock[] }
    | { kind: 'embed'; id: string };

  // First pass: group top-level nodes into text batches and embeds
  const items: RichTextItem[] = [];
  let currentTextBatch: TopLevelBlock[] = [];

  for (const node of doc.content) {
    if (node.nodeType === BLOCKS.EMBEDDED_ENTRY) {
      if (currentTextBatch.length > 0) {
        items.push({ kind: 'text', blocks: currentTextBatch });
        currentTextBatch = [];
      }
      items.push({ kind: 'embed', id: (node as any).data.target.sys.id });
    } else if (
      node.nodeType !== BLOCKS.EMBEDDED_ASSET &&
      node.nodeType !== BLOCKS.HR
    ) {
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
        id,
        text: html,
        format: 'html',
        layout: 'bodyLayout',
        style: 'bodyStyle',
      });
    } else {
      // embed — check if a text section follows to determine anchor
      const nextItem = items[i + 1];
      const hasFollowingText = nextItem?.kind === 'text';
      const anchor = hasFollowingText ? `body-section-${sectionIndex + 1}` : undefined;
      const embed = embedMap.get(item.id);
      if (!embed) continue;

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
    if (anchor) c.anchor = anchor;
    if (embed.altText) c.accessibilityCaption = embed.altText;
    if (embed.caption || embed.credit) {
      (c as any).caption = {
        role: 'caption',
        text: [embed.caption, embed.credit].filter(Boolean).join(' — '),
        layout: 'captionLayout',
        style: 'captionStyle',
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
    if (anchor) c.anchor = anchor;
    return c;
  }

  if (embed.type === 'soundstack') {
    const c: AnfComponent = {
      role: 'audio',
      audioURL: embed.url,
      layout: 'bodyAudioEmbed',
      style: 'bodyAudioEmbedStyle',
    };
    if (anchor) c.anchor = anchor;
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
    case BLOCKS.HEADING_1:
      return `<h1>${inlinesToHtml(node.content, linkMap)}</h1>`;
    case BLOCKS.HEADING_2:
      return `<h2>${inlinesToHtml(node.content, linkMap)}</h2>`;
    case BLOCKS.HEADING_3:
      return `<h3>${inlinesToHtml(node.content, linkMap)}</h3>`;
    case BLOCKS.HEADING_4:
      return `<h4>${inlinesToHtml(node.content, linkMap)}</h4>`;
    case BLOCKS.HEADING_5:
      return `<h5>${inlinesToHtml(node.content, linkMap)}</h5>`;
    case BLOCKS.HEADING_6:
      return `<h6>${inlinesToHtml(node.content, linkMap)}</h6>`;
    case BLOCKS.UL_LIST:
      return `<ul>${node.content.map(li => `<li>${inlinesToHtml((li as Block).content, linkMap)}</li>`).join('')}</ul>`;
    case BLOCKS.OL_LIST:
      return `<ol>${node.content.map(li => `<li>${inlinesToHtml((li as Block).content, linkMap)}</li>`).join('')}</ol>`;
    case BLOCKS.QUOTE:
      return `<blockquote>${inlinesToHtml(node.content, linkMap)}</blockquote>`;
    default:
      // Unrecognized block — render children as a paragraph
      return `<p>${inlinesToHtml(node.content, linkMap)}</p>`;
  }
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}
