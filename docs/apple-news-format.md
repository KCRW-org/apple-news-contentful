# Apple News Format (ANF) Reference

> Curated reference for this codebase. Raw fetched docs: `docs/raw/apple-news-format.md` (regenerate: `npm run update-docs`)  
> Source: https://developer.apple.com/documentation/applenewsformat

Every ANF document is a JSON file named `article.json` whose root is an `ArticleDocument` object.

---

## ArticleDocument

### Required properties

| Property | Type | Notes |
|----------|------|-------|
| `version` | string | ANF version — use `"1.7"`. Must not be earlier than any feature used. |
| `identifier` | string | Publisher-assigned unique ID. Up to 64 chars: letters, numbers, hyphens, underscores. **Never changes on update.** |
| `language` | string | IANA language subtag: `en`, `en-US`, `en-GB`, `en-AU`, `en-CA`, `fr-CA` |
| `title` | string | Article headline. **Plain text only** — no HTML or Markdown. |
| `layout` | Layout | Column grid definition (see below) |
| `components` | Component[] | Article content (see below) |
| `componentTextStyles` | object | Text style map. Must include at minimum a `"default"` key. |

### Optional properties

| Property | Notes |
|----------|-------|
| `documentStyle` | Background color: `{ "backgroundColor": "#F7F7F7" }` |
| `metadata` | Author, dates, keywords, canonical URL, thumbnail |
| `componentLayouts` | Named `ComponentLayout` objects reusable by components |
| `componentStyles` | Named `ComponentStyle` objects |
| `textStyles` | Named inline text styles |
| `colorScheme` | Dark Mode color behavior |
| `textFormat` | Global format for Text components: `"markdown"`, `"html"`, or `"none"` (default) |

### Minimal valid document

```json
{
  "version": "1.7",
  "identifier": "my-article-slug",
  "language": "en",
  "title": "Article Title",
  "layout": { "columns": 20, "width": 1024, "margin": 60, "gutter": 20 },
  "components": [
    { "role": "title", "text": "Article Title" },
    { "role": "body", "text": "Body text here." }
  ],
  "componentTextStyles": {
    "default": { "fontName": "Helvetica", "fontSize": 13 },
    "default-body": { "fontName": "Helvetica", "fontSize": 13 }
  }
}
```

---

## Layout

Defines the column grid used to position all components.

| Property | Type | Notes |
|----------|------|-------|
| `columns` | integer | **(Required)** Number of columns (e.g. `7` or `20`) |
| `width` | integer | **(Required)** Reference width in points (e.g. `1024`) |
| `margin` | integer | Left/right document margin in points. Default `60`. |
| `gutter` | integer | Space between columns in points. Use even numbers. |

---

## Components

Each component has a `role` that determines its type and rendering.

### Common component properties

| Property | Notes |
|----------|-------|
| `role` | **(Required)** Determines the component type |
| `layout` | Inline `ComponentLayout` or reference to a named layout in `componentLayouts` |
| `style` | Inline `ComponentStyle` or reference to a named style |
| `identifier` | Optional unique ID, required if other components anchor to this one |
| `anchor` | Anchors this component relative to another by `identifier` |
| `hidden` | Boolean, default `false` |
| `conditional` | Array of `ConditionalComponent` for responsive device-specific behavior |

### Text components

| Role | Notes |
|------|-------|
| `title` | Article headline |
| `heading`, `heading1`–`heading6` | Section headings |
| `body` | Main body text. Supports `"format": "html"` or `"markdown"`. |
| `intro` | Introductory paragraph |
| `byline` | Author/date attribution line |
| `caption` | Caption rendered in the article layout |
| `pullquote`, `quote` | Highlighted pull quotes |

Text components use `text` (string) and optional `textStyle` (named style or inline object).

### Image components

| Role | Notes |
|------|-------|
| `photo` | Photograph — use for editorial photos |
| `figure` | Figure (image + in-article caption) |
| `portrait` | Image of a person |
| `logo` | Logo image |
| `image` | Generic JPEG, WebP, PNG, or GIF |

Image `URL` can be `http://`, `https://`, or `bundle://` (requires matching MIME part in the API request).

### Photo component

```json
{
  "role": "photo",
  "URL": "https://example.com/image.jpg",
  "caption": { "text": "Shown when image is viewed full-screen" },
  "accessibilityCaption": "Alt text for VoiceOver users"
}
```

**`caption`** type is `CaptionDescriptor | string` — **not** a component object. It only appears in full-screen view. To show a caption in the article layout, add a separate `{ "role": "caption", "text": "..." }` component below the photo.

**`CaptionDescriptor`** is simply `{ "text": "..." }`.

### Other component roles

| Role | Purpose |
|------|---------|
| `video` | Video player |
| `audio` | Audio player |
| `music` | Apple Music embed |
| `tweet` | Tweet embed |
| `instagram` | Instagram embed |
| `gallery` | Horizontal photo gallery |
| `mosaic` | Mosaic photo grid |
| `section`, `chapter` | Container for grouping components |
| `aside` | Sidebar content |
| `divider` | Horizontal rule |
| `table` | Data table |
| `link_button` | Tappable CTA button |

---

## ComponentLayout

Controls a component's position and size within the column grid.

| Property | Notes |
|----------|-------|
| `columnStart` | 0-based index of the starting column |
| `columnSpan` | Number of columns the component spans |
| `margin` | Top/bottom margin — `Margin` object `{ "top": 10, "bottom": 10 }` or a single integer |
| `ignoreDocumentMargin` | Extend component into the document's left/right margins |
| `ignoreDocumentGutter` | Extend component into column gutters |
| `minimumHeight` | Minimum component height in points or supported units |

---

## Metadata object

Controls feed presentation and analytics. Set inside `ArticleDocument.metadata`.

| Property | Notes |
|----------|-------|
| `authors` | Array of author name strings |
| `datePublished` | ISO 8601 — controls feed sort order |
| `dateModified` | ISO 8601 |
| `excerpt` | Short summary shown in feed tiles |
| `keywords` | Array of keyword strings |
| `canonicalURL` | **Required for comScore analytics.** Do not change after publishing. |
| `thumbnailURL` | Image shown in feed tiles |
| `generatorName` / `generatorVersion` | Identifies the publishing tool |

---

## componentTextStyles

Must define `"default"`. Role-scoped defaults use `"default-<role>"` keys and apply to all components of that role unless overridden.

```json
"componentTextStyles": {
  "default": {
    "fontName": "Helvetica",
    "fontSize": 13,
    "linkStyle": { "textColor": "#428bca" }
  },
  "default-body": { "fontName": "Helvetica", "fontSize": 13 },
  "title": { "fontName": "Helvetica-Bold", "fontSize": 30, "hyphenation": false }
}
```
