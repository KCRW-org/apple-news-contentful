# Apple News Format (ANF) Reference

> Source: https://developer.apple.com/documentation/applenewsformat
> Last fetched: 2026-04-15

Apple News Format is a JSON document format (`article.json`) for creating articles in Apple News. The root object is `ArticleDocument`.

---

## ArticleDocument

| Property | Type | Notes |
|----------|------|-------|
| `components` | [Component] |  **(Required)** An array of components that form the content of this article. Components have different roles and types, such as `` and ``. |
| `componentTextStyles` | ArticleDocument.componentTextStyles |  **(Required)** The component text styles that components in this document can refer to. Each `article.json` file must have, at minimum, a default component text style named `default`. You can also set defaults by co |
| `identifier` | string |  **(Required)** A unique, publisher-provided identifier for this article. This identifier must remain constant; you can’t change it when you update the article. See ``. This identifier can include the following: |
| `language` | string |  **(Required)** A code that indicates the language of the article. Use the `` to find the appropriate code; example, `en` for example English, or the more specific `en-GB` for English (U.K.) or `en-US` for English (U |
| `layout` | Layout |  **(Required)** The article’s column system. Apple News Format layouts make it possible to recreate print design on iPhone, iPad, Mac, and Apple Vision Pro. Apple News Format uses the layout information to calculate |
| `title` | string |  **(Required)** The article title or headline. Use plain text; formatted text (HTML or Markdown) isn’t supported. |
| `version` | string |  **(Required)** The version of Apple News Format you use in the JSON document. The value of the `version` property must not be earlier than the version number of any property that you use anywhere in the article. See |
| `advertisingSettings` | AdvertisingSettings |  An advertisement to be inserted at a position that is both possible and optimal. You can specify what `bannerType` you want to have automatically inserted. Note. This property is deprecated. Use the ` |
| `autoplacement` | AutoPlacement |  The metadata, appearance, and placement of advertising and related content components within Apple News Format articles. |
| `colorScheme` | ArticleDocument.colorScheme |  The c`olorScheme` object that you use for automatic Dark Mode behavior. |
| `componentLayouts` | ArticleDocument.componentLayouts |  The article-level `ComponentLayout` objects that you can refer to by their key within the `ComponentLayouts` object. See ``. |
| `componentStyles` | ArticleDocument.componentStyles |  The component styles that you can refer to by components within this document. See ``. |
| `documentStyle` | DocumentStyle |  An object containing the background color of the article. |
| `metadata` | Metadata |  The article’s metadata, such as publication date, ad campaign data, and other information that isn’t part of the core article content. |
| `subtitle` | string |  The article subtitle. Should be plain text; formatted text (HTML or Markdown) isn’t supported. |
| `textFormat` | string |  The global text format to apply to `` components and `` objects. If you don’t specify the `textFormat` property, the `format` of `Text` components and `formattedText` objects defaults to `none`. If yo |
| `textStyles` | ArticleDocument.textStyles |  The `TextStyle` objects available to use inline for text in `Text` components. See ``, ``, and ``. |

**Required properties:** `version`, `identifier`, `language`, `title`, `layout`, `components`, `componentTextStyles`

```json
{
  "version": "1.7",
  "identifier": "article-unique-id",
  "language": "en",
  "title": "Article Title",
  "layout": { "columns": 20, "width": 1024, "margin": 60, "gutter": 20 },
  "components": [
    { "role": "title", "text": "Article Title" },
    { "role": "body", "text": "Body text." }
  ],
  "componentTextStyles": {
    "default": { "fontName": "Helvetica", "fontSize": 13 },
    "default-body": { "fontName": "Helvetica", "fontSize": 13 }
  }
}
```

---

## Layout

| Property | Type | Notes |
|----------|------|-------|
| `columns` | integer |  **(Required)** The number of columns in this article’s design. You must have at least one column. Using a 7-column design allows components to start in columns 0 to 6, and be between 1 and 7 columns wide. An article |
| `width` | integer |  **(Required)** The `width` (in points) this article was designed for. Apple News uses this property to calculate down-scaling scenarios for smaller devices. The width of the document must be sufficient to fit two ma |
| `gutter` | integer |  The gutter size for the article (in points). The gutter provides spacing between columns. Use an even number for this property; Apple News rounds up odd numbers to the next even number. If you omit th |
| `margin` | integer |  The outer (left and right) margins of the article, in points. If you omit this property, Apple News applies a default article margin of 60. If the margin is negative, the number is set to 0. If the ma |

---

## ComponentLayout

| Property | Type | Notes |
|----------|------|-------|
| `columnSpan` | integer |  A number that indicates how many columns the component spans, based on the number of columns in the document. By default, the component spans the entire width of the document or the width of its conta |
| `columnStart` | integer |  A number that indicates which column the component’s start position is in, based on the number of columns in the document or parent container. By default, the component starts in the first column (not |
| `conditional` | (ConditionalComponentLayout | [ConditionalComponentLayout]) |  An instance or array of component layout properties that you can apply conditionally, and the conditions that cause Apple News Format to apply them. |
| `horizontalContentAlignment` | string |  A string value that sets the alignment of the content within the component. This property applies only when the width of the content is less than the width of the component. Apple News supports this p |
| `ignoreDocumentGutter` | (boolean | string("none" | "left" | "right" | "both")) |  A value that indicates whether Apple News ignores the gutters (if any) to the left and right of the component. The gutter size is defined in the `Layout` object at the root level of the document. Use |
| `ignoreDocumentMargin` | (boolean | string("none" | "left" | "right" | "both")) |  A value that indicates whether the component applies or ignores the document’s margins. Ignoring document margins positions the component based on the document’s width and margin. Valid values: Instea |
| `ignoreViewportPadding` | (boolean | string("none" | "left" | "right" | "both")) |  A value that indicates whether the component applies or ignores the viewport padding. Ignoring viewport padding positions the component at the edge of the display screen. This property affects the lay |
| `margin` | (Margin | integer) |  A value that sets the margins for the top and bottom of the component as a single integer that Apple News applies to the top and bottom margins, or as an object containing separate properties for top |
| `maximumContentWidth` | (SupportedUnits | number) |  A value that sets the maximum width of the content within the component. Specify this value as a number in points or using one of the available units of measure for components. See ``. Apple News supp |
| `minimumHeight` | (SupportedUnits | number) |  A value that sets the minimum height of the component. A component is taller than its defined `minimumHeight` when the contents require the component to be taller. You can define the minimum height as |
| `minimumWidth` | (SupportedUnits | number) |  A value that defines the minimum width of the layout when you use it within a `` with `` as the specified `contentDisplay` type. You can define the minimum width as a number in points or using one of |
| `maximumWidth` | (SupportedUnits | number) |  A value that defines the maximum width of the layout when you use it within a `` with `` as the specified `contentDisplay` type. You can define the maximum width as a number in points or using one of |
| `padding` | (SupportedUnits | Padding | number) |  A value that defines the padding between the content of the component and the edges of the component. You can define padding as a number in points or using one of the available units of measure for co |

---

## Metadata

| Property | Type | Notes |
|----------|------|-------|
| `authors` | [string] |  The authors of this article. The value may or may not be the same string provided in the `` or `` component. Note the following: Note that the `byline` or `author` component in the article body don’t |
| `campaignData` | Metadata.campaignData |  A set of key-value pairs, where the value is an array of at least one item that you can leverage to target your advertising campaigns to specific articles or groups of articles. See `` in the ``. |
| `canonicalURL` | uri |  The canonical URL of a web version of this article. If this Apple  News Format document corresponds to a web version of this article, set this property to the URL of the web article. You can use this |
| `contentGenerationType` | string |  An optional string value that indicates the content creation source for the article. Valid values: |
| `dateCreated` | date-time |  The UTC date in ISO 8601 format (`YYYY-MM-DDTHH:mm:ss±ZZ:ZZ`) on which this article was created. This value may or may not be the same as `datePublished`. |
| `dateModified` | date-time |  The UTC date in ISO 8601 format (`YYYY-MM-DDTHH:mm:ss±ZZ:ZZ`) on which this article was last modified after it was published. Apple News Format uses this date instead of `datePublished` in the article |
| `datePublished` | date-time |  The UTC date in ISO 8601 format (`YYYY-MM-DDTHH:mm:ss±ZZ:ZZ`) on which this article was first published. Apple News Format uses this date in the feed. Include this date when posting older content to m |
| `excerpt` | string |  A summary of your article. It can also be a subheadline or a quote.  Keep your excerpt within the recommended 80–300 character range. This text may appear in the article tile in feeds. It can also app |
| `generatorIdentifier` | string |  A unique identifier for the generator you use to create or provide this JSON document. |
| `generatorName` | string |  The name of the generator or system that you use to create the JSON document. |
| `generatorVersion` | string |  The version “number,” as a string, of the generator you use to create the JSON document. |
| `issue` | Issue |  The object for defining information about an issue. |
| `keywords` | [string] |  The keywords that describe this article. You can define up to 50 keywords. |
| `links` | [LinkedArticle] |  An array of links to other articles in Apple News. |
| `thumbnailURL` | string |  The URL of an image that can represent this article in a News feed view, such as the Today feed, channel feeds, and topic feeds. For best results, provide a high-resolution image. Apple News automatic |
| `videoURL` | uri |  The URL for the video that represents this article. A glyph appears on the thumbnail of the article tile, allowing the video to be playable from feeds, such as the Today feed, channel feeds, and topic |

---

## Photo Component

```json
{
  "role": "photo",
  "URL": "https://example.com/image.jpg",
  "caption": { "text": "Caption shown in full-screen view" },
  "accessibilityCaption": "Alt text for VoiceOver"
}
```

| Property | Type | Notes |
|----------|------|-------|
| `URL` | uri |  **(Required)** The URL of an image file. Image URLs can begin with `http://`, `https://`, or `bundle://`. If the image URL begins with `bundle://`, the image file must be in the same directory as the document. Encod |
| `role` | string |  **(Required)** Always `photo` for this component. |
| `accessibilityCaption` | string |  A caption that describes the photo.  VoiceOver uses this text. For more information about VoiceOver, see the `` page in Accessibility. If you don’t provide `accessibilityCaption`, VoiceOver uses the ` |
| `additions` | [ComponentLink] |  An array of `ComponentLink` objects you can use to create a `ComponentLink`, allowing a link to anywhere in News. |
| `anchor` | Anchor |  An object that defines vertical alignment with another component. |
| `animation` | (ComponentAnimation | string("none")) |  An object that defines an animation you apply to the component. Use the `none` value for conditional design elements. Adding it here has no effect. |
| `behavior` | (Behavior | string("none")) |  An object that defines behavior for a component, like `` or ``. Use the `none` value for conditional design elements. Adding it here has no effect. |
| `caption` | (CaptionDescriptor | string) |  A caption that describes the image. The article displays this text when the image is full screen, and VoiceOver uses this text if you don’t provide `accessibilityCaption` text. For more information ab |
| `conditional` | (ConditionalComponent | [ConditionalComponent]) |  An instance or array of component properties that you can apply conditionally, and the conditions that cause Apple News Format to apply them. |
| `explicitContent` | boolean |  A Boolean value that indicates the image may contain explicit content. |
| `hidden` | boolean |  A Boolean value that determines whether the component is hidden. |
| `identifier` | string |  An optional unique identifier for this component. If you use     `identifier`, it must be unique across the entire document. You need an `identifier` for your component if you want to anchor other com |
| `layout` | (ComponentLayout | string) |  An inline `ComponentLayout` object that contains layout information, or a string reference to a `ComponentLayout` object that you define at the top level of the document. If you don’t define `layout`, |
| `style` | (ComponentStyle | string | string("none")) |  An inline `ComponentStyle` object that defines the appearance of this component, or a string reference to a `ComponentStyle` object that you define at the top level of the document. Use the `none` val |

**Important:** `caption` is `CaptionDescriptor | string` — NOT a component object with `role`/`layout`/`style`. It only appears in full-screen view. Use a separate `caption` role component for in-article captions.

---

## CaptionDescriptor

| Property | Type | Notes |
|----------|------|-------|
| `text` | string |  **(Required)** The text to display in the caption, including any formatting tags or markup, depending on the format property. |
| `additions` | [Addition] |  An array of `Link` objects that provide additional information for ranges of the caption text in the text property. If you set format to `html` or `markdown`, Apple News Format doesnʼt support `Additi |
| `format` | string |  The formatting or markup method applied to the text. If you set format to `htm`l or `markdown`, Apple News Format doesn’t support `Additions` or `InlineTextStyles`. |
| `inlineTextStyles` | [InlineTextStyle] |  An array of `InlineTextStyle` objects you apply to ranges of the caption’s text. Apple News Format ignores `InlineTextStyles` when `format` is set to `html` or `markdown`. |
| `textStyle` | (ComponentTextStyle | string) |  An inline `ComponentTextStyle` object that contains styling information, or a string reference to a component text style object that you define at the top level of the document. |

---

## Common Component Roles

| Role | Type | Notes |
|------|------|-------|
| `title` | Text | Article headline |
| `body` | Text | Main body. Supports `format: "html"` or `"markdown"`. |
| `heading`, `heading1`–`heading6` | Text | Section headings |
| `intro` | Text | Introductory paragraph |
| `byline` | Text | Author attribution |
| `caption` | Text | Caption in article layout |
| `pullquote`, `quote` | Text | Highlighted quotes |
| `photo` | Image | Photograph |
| `figure` | Image | Figure with context |
| `portrait` | Image | Person image |
| `video` | Media | Video player |
| `audio` | Media | Audio player |
| `gallery` | Container | Photo gallery |
| `section`, `chapter` | Container | Groups of components |
| `divider` | Layout | Horizontal rule |

---

## componentTextStyles

Must include at minimum a `"default"` key. Role-scoped defaults use `"default-<role>"` keys.

```json
"componentTextStyles": {
  "default": { "fontName": "Helvetica", "fontSize": 13, "linkStyle": { "textColor": "#428bca" } },
  "default-body": { "fontName": "Helvetica", "fontSize": 13 },
  "title": { "fontName": "Helvetica-Bold", "fontSize": 30, "hyphenation": false }
}
```
