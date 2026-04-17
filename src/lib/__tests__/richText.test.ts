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
    expect(components[0].URL).toBe('https://audio.example.com/ep.mp3');
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

const listItem = (...inlineNodes: unknown[]) => ({
  nodeType: BLOCKS.LIST_ITEM,
  data: {},
  content: [{
    nodeType: BLOCKS.PARAGRAPH,
    data: {},
    content: inlineNodes,
  }],
});

const textNode = (value: string, ...marks: string[]) => ({
  nodeType: 'text',
  value,
  marks: marks.map(type => ({ type })),
  data: {},
});

describe('nodeToHtml — lists', () => {
  it('renders an unordered list as <ul><li>', () => {
    const node = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [
        listItem(textNode('First')),
        listItem(textNode('Second')),
      ],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ul><li>First</li><li>Second</li></ul>');
  });

  it('renders an ordered list as <ol><li>', () => {
    const node = {
      nodeType: BLOCKS.OL_LIST,
      data: {},
      content: [listItem(textNode('One')), listItem(textNode('Two'))],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ol><li>One</li><li>Two</li></ol>');
  });

  it('renders inline formatting inside list items', () => {
    const node = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [listItem(textNode('bold', 'bold'), textNode(' normal'))],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ul><li><strong>bold</strong> normal</li></ul>');
  });

  it('renders hyperlinks inside list items', () => {
    const node = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [{
        nodeType: BLOCKS.LIST_ITEM,
        data: {},
        content: [{
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [{
            nodeType: INLINES.HYPERLINK,
            data: { uri: 'https://example.com' },
            content: [textNode('Link')],
          }],
        }],
      }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ul><li><a href="https://example.com">Link</a></li></ul>');
  });

  it('renders multi-paragraph list items using nodeToHtml on each child', () => {
    const node = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [{
        nodeType: BLOCKS.LIST_ITEM,
        data: {},
        content: [
          { nodeType: BLOCKS.PARAGRAPH, data: {}, content: [textNode('First para')] },
          { nodeType: BLOCKS.PARAGRAPH, data: {}, content: [textNode('Second para')] },
        ],
      }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ul><li><p>First para</p><p>Second para</p></li></ul>');
  });

  it('renders nested lists', () => {
    const nestedList = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [listItem(textNode('Nested'))],
    };
    const node = {
      nodeType: BLOCKS.UL_LIST,
      data: {},
      content: [{
        nodeType: BLOCKS.LIST_ITEM,
        data: {},
        content: [
          { nodeType: BLOCKS.PARAGRAPH, data: {}, content: [textNode('Parent')] },
          nestedList,
        ],
      }],
    };
    const html = nodeToHtml(node as any, new Map());
    expect(html).toBe('<ul><li><p>Parent</p><ul><li>Nested</li></ul></li></ul>');
  });
});

describe('nodeToHtml — inline marks', () => {
  it('renders underline as <span data-anf-textstyle="style-underline">', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [textNode('underlined', 'underline')],
    };
    expect(nodeToHtml(node as any, new Map())).toBe('<p><span data-anf-textstyle="style-underline">underlined</span></p>');
  });

  it('renders code mark as <code>', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [textNode('const x = 1', 'code')],
    };
    expect(nodeToHtml(node as any, new Map())).toBe('<p><code>const x = 1</code></p>');
  });

  it('escapes HTML-unsafe characters in text', () => {
    const node = {
      nodeType: BLOCKS.PARAGRAPH,
      data: {},
      content: [textNode('<script>alert("xss")</script>')],
    };
    expect(nodeToHtml(node as any, new Map())).toContain('&lt;script&gt;');
    expect(nodeToHtml(node as any, new Map())).not.toContain('<script>');
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

describe('richTextToComponents — headings', () => {
  it('emits h2 as a separate heading2 ANF component', () => {
    const doc = makeDoc(
      paragraph('Before'),
      {
        nodeType: BLOCKS.HEADING_2,
        data: {},
        content: [{ nodeType: 'text', value: 'Section Title', marks: [], data: {} }],
      },
      paragraph('After'),
    );
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(3);
    expect(components[0].role).toBe('body');
    expect(components[1].role).toBe('heading2');
    expect(components[1].text).toBe('Section Title');
    expect(components[1].format).toBe('html');
    expect(components[1].textStyle).toBe('default-heading2');
    expect(components[2].role).toBe('body');
  });

  it('preserves inline formatting in headings', () => {
    const doc = makeDoc({
      nodeType: BLOCKS.HEADING_3,
      data: {},
      content: [
        { nodeType: 'text', value: 'Bold ', marks: [{ type: 'bold' }], data: {} },
        { nodeType: 'text', value: 'heading', marks: [], data: {} },
      ],
    });
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('heading3');
    expect(components[0].text).toBe('<strong>Bold </strong>heading');
  });

  it('renders all six heading levels with correct roles', () => {
    const headings = [1, 2, 3, 4, 5, 6].map(level => ({
      nodeType: `heading-${level}`,
      data: {},
      content: [{ nodeType: 'text', value: `H${level}`, marks: [], data: {} }],
    }));
    const doc = makeDoc(...headings);
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(components[i].role).toBe(`heading${i + 1}`);
      expect(components[i].text).toBe(`H${i + 1}`);
    }
  });

  it('heading between paragraphs splits text batches', () => {
    const doc = makeDoc(
      paragraph('Para 1'),
      paragraph('Para 2'),
      {
        nodeType: BLOCKS.HEADING_2,
        data: {},
        content: [{ nodeType: 'text', value: 'Title', marks: [], data: {} }],
      },
      paragraph('Para 3'),
    );
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(3);
    expect(components[0].role).toBe('body');
    expect(components[0].id).toBe('body-section-1');
    expect((components[0].text as string)).toContain('Para 1');
    expect((components[0].text as string)).toContain('Para 2');
    expect(components[1].role).toBe('heading2');
    expect(components[2].role).toBe('body');
    expect(components[2].id).toBe('body-section-2');
  });

  it('renders hyperlinks inside headings', () => {
    const doc = makeDoc({
      nodeType: BLOCKS.HEADING_2,
      data: {},
      content: [{
        nodeType: INLINES.HYPERLINK,
        data: { uri: 'https://example.com' },
        content: [{ nodeType: 'text', value: 'Link', marks: [], data: {} }],
      }],
    });
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components[0].text).toBe('<a href="https://example.com">Link</a>');
  });
});

describe('richTextToComponents — blockquotes', () => {
  it('emits a blockquote as a pullquote ANF component', () => {
    const doc = makeDoc({
      nodeType: BLOCKS.QUOTE,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [{ nodeType: 'text', value: 'A wise quote', marks: [], data: {} }],
      }],
    });
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(1);
    expect(components[0].role).toBe('pullquote');
    expect(components[0].text).toContain('A wise quote');
    expect(components[0].format).toBe('html');
  });

  it('preserves inline formatting in blockquotes', () => {
    const doc = makeDoc({
      nodeType: BLOCKS.QUOTE,
      data: {},
      content: [{
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [
          { nodeType: 'text', value: 'emphasis', marks: [{ type: 'italic' }], data: {} },
          { nodeType: 'text', value: ' here', marks: [], data: {} },
        ],
      }],
    });
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components[0].text).toContain('<em>emphasis</em>');
    expect(components[0].text).toContain(' here');
  });
});

describe('richTextToComponents — dividers', () => {
  it('emits an HR as a divider component', () => {
    const doc = makeDoc(
      paragraph('Before'),
      { nodeType: BLOCKS.HR, data: {}, content: [] },
      paragraph('After'),
    );
    const components = richTextToComponents(doc, new Map(), new Map());
    expect(components).toHaveLength(3);
    expect(components[1].role).toBe('divider');
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
