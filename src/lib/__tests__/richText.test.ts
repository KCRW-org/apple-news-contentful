import { describe, it, expect } from 'vitest';
import { richTextToComponents, nodeToHtml } from '../richText';
import { BLOCKS, INLINES, Document } from '@contentful/rich-text-types';
import type { ResolvedEmbed } from '../../types';

const paragraph = (text: string) => ({
  nodeType: BLOCKS.PARAGRAPH,
  data: {},
  content: [{ nodeType: 'text', value: text, marks: [], data: {} }],
});

const embeddedEntry = (id: string) => ({
  nodeType: BLOCKS.EMBEDDED_ENTRY,
  data: { target: { sys: { id, type: 'Link', linkType: 'Entry' } } },
  content: [],
});

const makeDoc = (...nodes: unknown[]): Document => ({
  nodeType: BLOCKS.DOCUMENT,
  data: {},
  content: nodes as any,
});

describe('richTextToComponents', () => {
  it('converts a single paragraph to a body component', () => {
    const doc = makeDoc(paragraph('Hello world'));
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('body');
    expect(components[0].id).toBe('body-section-1');
    expect(components[0].format).toBe('html');
    expect(components[0].text as string).toContain('Hello world');
  });

  it('assigns sequential IDs to multiple consecutive text blocks', () => {
    const doc = makeDoc(paragraph('First'), paragraph('Second'));
    // Consecutive text blocks are batched into one body component
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].id).toBe('body-section-1');
  });

  it('inserts photo component between text sections with anchor', () => {
    const photo: ResolvedEmbed = { type: 'photo', url: 'https://img.example.com/a.jpg' };
    const embedMap = new Map([['photo1', photo]]);
    const doc = makeDoc(paragraph('Before'), embeddedEntry('photo1'), paragraph('After'));
    const components = richTextToComponents(doc, embedMap, new Map());
    // before-text, photo, after-text
    expect(components).toHaveLength(3);
    expect(components[0].role).toBe('body');
    expect(components[0].id).toBe('body-section-1');
    expect(components[1].role).toBe('photo');
    expect(components[1].anchor).toBe('body-section-2');
    expect(components[2].role).toBe('body');
    expect(components[2].id).toBe('body-section-2');
  });

  it('does not add anchor to trailing embed (no following text section)', () => {
    const photo: ResolvedEmbed = { type: 'photo', url: 'https://img.example.com/a.jpg' };
    const embedMap = new Map([['photo1', photo]]);
    const doc = makeDoc(paragraph('Before'), embeddedEntry('photo1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(2);
    expect(components[1].anchor).toBeUndefined();
  });

  it('renders youtube mediaLink as embedwebvideo', () => {
    const ytEmbed: ResolvedEmbed = { type: 'youtube', url: 'https://www.youtube.com/watch?v=abc' };
    const embedMap = new Map([['yt1', ytEmbed]]);
    const doc = makeDoc(embeddedEntry('yt1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('embedwebvideo');
    expect(components[0].URL).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('renders audio mediaLink as audio', () => {
    const audioEmbed: ResolvedEmbed = { type: 'audio', url: 'https://audio.example.com/ep.mp3' };
    const embedMap = new Map([['au1', audioEmbed]]);
    const doc = makeDoc(embeddedEntry('au1'));
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('audio');
    expect(components[0].audioURL).toBe('https://audio.example.com/ep.mp3');
  });

  it('omits unresolved block embeds entirely (Apple News rejects paragraphs with no text content)', () => {
    const doc = makeDoc(embeddedEntry('unknown-id'));
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(0);
  });

  it('renders ENTRY_HYPERLINK as <a> when URL is in linkMap', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{
          nodeType: INLINES.ENTRY_HYPERLINK,
          data: { target: { sys: { id: 'story1', type: 'Link', linkType: 'Entry' } } },
          content: [{ nodeType: 'text', value: 'My Story', marks: [], data: {} }],
        }],
      }],
    };
    const linkMap = new Map([['story1', 'https://www.kcrw.com/stories/my-story']]);
    const components = richTextToComponents(doc, new Map(), linkMap);
    expect(components[0].text as string).toContain('<a href="https://www.kcrw.com/stories/my-story">My Story</a>');
  });

  it('renders ENTRY_HYPERLINK as plain text when URL is null', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{
          nodeType: INLINES.ENTRY_HYPERLINK,
          data: { target: { sys: { id: 'show1', type: 'Link', linkType: 'Entry' } } },
          content: [{ nodeType: 'text', value: 'My Show', marks: [], data: {} }],
        }],
      }],
    };
    const linkMap = new Map<string, string | null>([['show1', null]]);
    const components = richTextToComponents(doc, new Map(), linkMap);
    expect(components[0].text as string).toContain('My Show');
    expect(components[0].text as string).not.toContain('<a ');
  });
});

describe('nodeToHtml', () => {
  it('renders bold mark as <strong>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{ nodeType: 'text', value: 'Bold', marks: [{ type: 'bold' }], data: {} }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<strong>Bold</strong>');
  });

  it('renders italic mark as <em>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{ nodeType: 'text', value: 'Italic', marks: [{ type: 'italic' }], data: {} }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<em>Italic</em>');
  });

  it('renders hyperlink as <a>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [{
        nodeType: INLINES.HYPERLINK,
        data: { uri: 'https://example.com' },
        content: [{ nodeType: 'text', value: 'Link', marks: [], data: {} }],
      }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toContain('<a href="https://example.com">Link</a>');
  });
});

describe('richTextToComponents — unavailable linked content', () => {
  it('drops an entry hyperlink whose target is missing from linkMap, keeping the inner text', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [
          { nodeType: 'text', value: 'See ', marks: [], data: {} },
          {
            nodeType: INLINES.ENTRY_HYPERLINK,
            data: { target: { sys: { id: 'deleted-entry' } } },
            content: [{ nodeType: 'text', value: 'this story', marks: [], data: {} }],
          } as any,
          { nodeType: 'text', value: '.', marks: [], data: {} },
        ],
      }],
    };
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    const html = (components[0] as any).text as string;
    expect(html).not.toContain('<a ');
    expect(html).toContain('See this story.');
  });

  it('drops an entry hyperlink whose linkMap entry is explicitly null', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{
          nodeType: INLINES.ENTRY_HYPERLINK,
          data: { target: { sys: { id: 'broken' } } },
          content: [{ nodeType: 'text', value: 'text', marks: [], data: {} }],
        } as any],
      }],
    };
    const linkMap = new Map<string, string | null>([['broken', null]]);
    const components = richTextToComponents(doc, new Map(), linkMap);
    const html = (components[0] as any).text as string;
    expect(html).not.toContain('<a ');
    expect(html).toContain('text');
  });

  it('omits an unavailable block embed between text paragraphs; adjacent text batches split around the gap', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [{ nodeType: 'text', value: 'Before.', marks: [], data: {} }],
        },
        {
          nodeType: BLOCKS.EMBEDDED_ENTRY,
          data: { target: { sys: { id: 'deleted-photo' } } },
          content: [],
        } as any,
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [{ nodeType: 'text', value: 'After.', marks: [], data: {} }],
        },
      ],
    };
    // embedMap is empty — the embedded entry could not be resolved.
    const components = richTextToComponents(doc, new Map(), new Map());
    // Since we skip the unresolved embed without inserting a placeholder, the two
    // text blocks flow into a single batch (nothing separates them after filtering).
    expect(components).toHaveLength(1);
    expect((components[0] as any).text).toBe('<p>Before.</p><p>After.</p>');
  });

  it('still emits resolved embeds when adjacent to a broken one', () => {
    const doc: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [{ nodeType: 'text', value: 'Intro.', marks: [], data: {} }],
        },
        {
          nodeType: BLOCKS.EMBEDDED_ENTRY,
          data: { target: { sys: { id: 'missing' } } },
          content: [],
        } as any,
        {
          nodeType: BLOCKS.EMBEDDED_ENTRY,
          data: { target: { sys: { id: 'good-photo' } } },
          content: [],
        } as any,
      ],
    };
    const embedMap = new Map<string, ResolvedEmbed>([
      ['good-photo', { type: 'photo', url: 'https://img.example.com/a.jpg' }],
    ]);
    const components = richTextToComponents(doc, embedMap, new Map());
    expect(components).toHaveLength(2);
    expect((components[0] as any).role).toBe('body');
    expect((components[0] as any).text).toBe('<p>Intro.</p>');
    expect((components[1] as any).role).toBe('photo');
    expect((components[1] as any).URL).toBe('https://img.example.com/a.jpg');
  });
});
