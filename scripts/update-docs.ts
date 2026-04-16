/**
 * Fetches Apple News API and ANF reference documentation from Apple's
 * documentation JSON API and writes raw output to docs/raw/.
 *
 * The curated docs at docs/apple-news-api.md and docs/apple-news-format.md
 * are maintained by hand and reference these raw files as a source of truth
 * when Apple updates their documentation.
 *
 * Apple exposes structured JSON at:
 *   https://developer.apple.com/tutorials/data/documentation/<path>.json
 *
 * Usage: npm run update-docs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_BASE = "https://developer.apple.com/tutorials/data/documentation";
const DOCS_DIR = join(__dirname, "../docs/raw");
const TODAY = new Date().toISOString().slice(0, 10);

type ContentNode = { type: string; text?: string; inlineContent?: ContentNode[]; code?: string };
type DocData = Record<string, unknown>;

async function fetchDocJson(path: string): Promise<DocData> {
  const url = `${DATA_BASE}/${path}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<DocData>;
}

/** Render Apple's doc content nodes to Markdown text */
function renderContent(nodes: ContentNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text ?? "";
        case "codeVoice":
          return `\`${node.code ?? node.text ?? ""}\``;
        case "strong":
          return `**${renderContent(node.inlineContent ?? [])}**`;
        case "emphasis":
          return `*${renderContent(node.inlineContent ?? [])}*`;
        case "reference":
          return `\`${node.text ?? ""}\``;
        default:
          return node.text ?? renderContent(node.inlineContent ?? []);
      }
    })
    .join("");
}

/** Extract a readable summary from a doc page's primaryContentSections */
function extractPrimarySections(data: DocData): string {
  const sections = (data.primaryContentSections as unknown[]) ?? [];
  const lines: string[] = [];

  for (const sec of sections) {
    const s = sec as Record<string, unknown>;
    if (s.kind === "content") {
      const content = (s.content as Array<Record<string, unknown>>) ?? [];
      for (const block of content) {
        if (block.type === "heading") {
          const level = (block.level as number) ?? 2;
          lines.push(`${"#".repeat(level + 1)} ${block.text}`);
        } else if (block.type === "paragraph") {
          const text = renderContent((block.inlineContent as ContentNode[]) ?? []);
          lines.push(text);
        } else if (block.type === "codeListing") {
          const lang = (block.syntax as string) ?? "";
          const code = ((block.code as string[]) ?? []).join("\n");
          lines.push(`\`\`\`${lang}\n${code}\n\`\`\``);
        } else if (block.type === "unorderedList") {
          for (const item of (block.items as Array<{ content: unknown[] }>) ?? []) {
            const itemContent = (item.content as Array<Record<string, unknown>>) ?? [];
            for (const c of itemContent) {
              if (c.type === "paragraph") {
                const text = renderContent((c.inlineContent as ContentNode[]) ?? []);
                lines.push(`- ${text}`);
              }
            }
          }
        } else if (block.type === "note") {
          const noteContent = (block.content as Array<Record<string, unknown>>) ?? [];
          for (const c of noteContent) {
            if (c.type === "paragraph") {
              const text = renderContent((c.inlineContent as ContentNode[]) ?? []);
              lines.push(`> **Note:** ${text}`);
            }
          }
        }
      }
    } else if (s.kind === "declarations") {
      // Skip — raw type declarations aren't useful in our docs
    } else if (s.kind === "parameters") {
      lines.push("### Parameters");
      const params = (s.parameters as Array<{ name: string; content: unknown[] }>) ?? [];
      for (const p of params) {
        const desc = ((p.content as Array<Record<string, unknown>>) ?? [])
          .filter((c) => c.type === "paragraph")
          .map((c) => renderContent((c.inlineContent as ContentNode[]) ?? []))
          .join(" ");
        lines.push(`- **\`${p.name}\`** — ${desc}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/** Extract a structured properties table from a doc page */
function extractPropertiesTable(data: DocData): string {
  const sections = (data.primaryContentSections as unknown[]) ?? [];
  const refs = (data.references as Record<string, DocData>) ?? {};
  const rows: string[] = [];

  for (const sec of sections) {
    const s = sec as Record<string, unknown>;
    if (s.kind !== "properties") continue;
    const items = (s.items as Array<Record<string, unknown>>) ?? [];
    for (const item of items) {
      const name = item.name as string;
      const required = item.required ? " **(Required)**" : "";
      const deprecated = (item.attributes as string[] | undefined)?.includes("deprecated")
        ? " *(deprecated)*"
        : "";
      const typeRef = ((item.type as Array<{ identifier?: string; text?: string }>) ?? [])
        .map((t) => (t.identifier ? refs[t.identifier]?.title ?? t.text : t.text) ?? "")
        .join("")
        .trim();
      const contentBlocks = (item.content as Array<Record<string, unknown>>) ?? [];
      const desc = contentBlocks
        .filter((c) => c.type === "paragraph")
        .map((c) => renderContent((c.inlineContent as ContentNode[]) ?? []))
        .join(" ")
        .slice(0, 200)
        .trim();
      rows.push(`| \`${name}\` | ${typeRef} | ${required}${deprecated} ${desc} |`);
    }
  }

  if (rows.length === 0) return "";
  return ["| Property | Type | Notes |", "|----------|------|-------|", ...rows].join("\n");
}

/** Fetch multiple pages and combine their content */
async function fetchPages(paths: string[]): Promise<Array<{ path: string; data: DocData }>> {
  const results = await Promise.allSettled(paths.map((p) => fetchDocJson(p).then((d) => ({ path: p, data: d }))));
  return results
    .filter((r): r is PromiseFulfilledResult<{ path: string; data: DocData }> => r.status === "fulfilled")
    .map((r) => r.value);
}

async function updateApiDocs() {
  console.log("Fetching Apple News API docs...");

  const pages = await fetchPages([
    "applenews/about-the-apple-news-security-model",
    "applenewsapi/post-channels-_channelid_-articles",
    "applenewsapi/post-articles-_articleid_",
    "applenewsapi/delete-articles-_articleid_",
    "applenewsapi/get-articles-_articleid_",
    "applenewsapi/create-article-metadata-fields",
    "applenewsapi/update-article-metadata-fields",
    "applenewsapi/article",
  ]);

  const sectionFor = (path: string) => pages.find((p) => p.path.endsWith(path));

  const securityContent = pages.find((p) => p.path.endsWith("about-the-apple-news-security-model"));
  const createContent = sectionFor("post-channels-_channelid_-articles");
  const updateContent = sectionFor("post-articles-_articleid_");
  const deleteContent = sectionFor("delete-articles-_articleid_");
  const articleContent = sectionFor("article");
  const createMetaContent = sectionFor("create-article-metadata-fields");
  const updateMetaContent = sectionFor("update-article-metadata-fields");

  const fetched = pages.length;
  console.log(`  Fetched ${fetched}/${pages.length + (7 - fetched)} pages successfully`);

  const md = `# Apple News Publisher API Reference

> Source: https://developer.apple.com/documentation/applenewsapi
> Last fetched: ${TODAY}

The Apple News API is a REST web service for publishing and managing Apple News Format articles. Base URL: \`https://news-api.apple.com\`.

---

## Security Model

${securityContent ? extractPrimarySections(securityContent.data) : "_Could not fetch — see https://developer.apple.com/documentation/applenews/about-the-apple-news-security-model_"}

### Authorization Header Format

\`\`\`
HHMAC; key=<api-key-id>; signature=<base64-hmac-sha256>; date=<ISO8601-date>
\`\`\`

**GET canonical string:** \`METHOD + URL + date\`

**POST canonical string:** \`METHOD + URL + date + Content-Type + body\`

See \`src/lib/api.ts\` for the implementation.

---

## Create an Article

\`\`\`
POST https://news-api.apple.com/channels/{channelId}/articles
\`\`\`

${createContent ? extractPrimarySections(createContent.data) : "_Could not fetch_"}

---

## Update an Article

\`\`\`
POST https://news-api.apple.com/articles/{articleId}
\`\`\`

${updateContent ? extractPrimarySections(updateContent.data) : "_Could not fetch_"}

---

## Delete an Article

\`\`\`
DELETE https://news-api.apple.com/articles/{articleId}
\`\`\`

${deleteContent ? extractPrimarySections(deleteContent.data) : "_Could not fetch_"}

---

## Article Object

${articleContent ? extractPropertiesTable(articleContent.data) || extractPrimarySections(articleContent.data) : "_Could not fetch_"}

### Article States

| State | Meaning |
|-------|---------|
| \`PROCESSING\` | Published, currently processing |
| \`LIVE\` | Published and visible in News |
| \`PROCESSING_UPDATE\` | Previous version live, update processing |
| \`TAKEN_DOWN\` | Previously live, now taken down |
| \`FAILED_PROCESSING\` | Failed processing, not visible |
| \`FAILED_PROCESSING_UPDATE\` | Previous version live, update failed |
| \`DUPLICATE\` | Duplicate of another article, not visible |

---

## Create Article Metadata Fields

Wrap all fields in a \`data\` key. Include in the \`metadata\` MIME part.

${createMetaContent ? extractPropertiesTable(createMetaContent.data) || extractPrimarySections(createMetaContent.data) : "_Could not fetch_"}

---

## Update Article Metadata Fields

Same as create metadata, but \`revision\` is **required**.

${updateMetaContent ? extractPropertiesTable(updateMetaContent.data) || extractPrimarySections(updateMetaContent.data) : "_Could not fetch_"}

---

## MIME Multipart Rules

Every MIME part must have \`Content-Disposition: form-data; name=<name>; filename=<filename>\`.

| Part | name= | filename= | Content-Type |
|------|-------|-----------|-------------|
| ANF document | \`article.json\` | \`article.json\` | \`application/json\` |
| Metadata | \`metadata\` | *(omit)* | \`application/json\` |
| Binary assets | any | must match \`bundle://\` path in article.json | \`image/jpeg\`, \`image/png\`, \`image/gif\`, or \`application/octet-stream\` |

Key error codes: \`MIME_PART_MISSING_FILENAME\`, \`WRONG_REVISION\`, \`INVALID_DOCUMENT\`, \`ONLY_PREVIEW_ALLOWED\`, \`DUPLICATE_ARTICLE_FOUND\`.
`;

  writeFileSync(join(DOCS_DIR, "apple-news-api.md"), md);
  console.log("✓ docs/raw/apple-news-api.md updated");
}

async function updateAnfDocs() {
  console.log("Fetching Apple News Format docs...");

  const pages = await fetchPages([
    "applenewsformat/articledocument",
    "applenewsformat/photo",
    "applenewsformat/layout",
    "applenewsformat/componentlayout",
    "applenewsformat/metadata",
    "applenewsformat/captiondescriptor",
    "applenewsformat/text",
  ]);

  const fetched = pages.length;
  console.log(`  Fetched ${fetched} pages successfully`);

  const sectionFor = (name: string) => pages.find((p) => p.path.endsWith(name));

  const articleDoc = sectionFor("articledocument");
  const photo = sectionFor("photo");
  const layout = sectionFor("layout");
  const componentLayout = sectionFor("componentlayout");
  const metadata = sectionFor("metadata");
  const captionDescriptor = sectionFor("captiondescriptor");

  const md = `# Apple News Format (ANF) Reference

> Source: https://developer.apple.com/documentation/applenewsformat
> Last fetched: ${TODAY}

Apple News Format is a JSON document format (\`article.json\`) for creating articles in Apple News. The root object is \`ArticleDocument\`.

---

## ArticleDocument

${articleDoc ? extractPropertiesTable(articleDoc.data) || extractPrimarySections(articleDoc.data) : "_Could not fetch_"}

**Required properties:** \`version\`, \`identifier\`, \`language\`, \`title\`, \`layout\`, \`components\`, \`componentTextStyles\`

\`\`\`json
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
\`\`\`

---

## Layout

${layout ? extractPropertiesTable(layout.data) || extractPrimarySections(layout.data) : "_Could not fetch_"}

---

## ComponentLayout

${componentLayout ? extractPropertiesTable(componentLayout.data) || extractPrimarySections(componentLayout.data) : "_Could not fetch_"}

---

## Metadata

${metadata ? extractPropertiesTable(metadata.data) || extractPrimarySections(metadata.data) : "_Could not fetch_"}

---

## Photo Component

\`\`\`json
{
  "role": "photo",
  "URL": "https://example.com/image.jpg",
  "caption": { "text": "Caption shown in full-screen view" },
  "accessibilityCaption": "Alt text for VoiceOver"
}
\`\`\`

${photo ? extractPropertiesTable(photo.data) || extractPrimarySections(photo.data) : "_Could not fetch_"}

**Important:** \`caption\` is \`CaptionDescriptor | string\` — NOT a component object with \`role\`/\`layout\`/\`style\`. It only appears in full-screen view. Use a separate \`caption\` role component for in-article captions.

---

## CaptionDescriptor

${captionDescriptor ? extractPropertiesTable(captionDescriptor.data) || extractPrimarySections(captionDescriptor.data) : "Simple object: \`{ \"text\": \"...\" }\`. Used as the \`caption\` property on image components."}

---

## Common Component Roles

| Role | Type | Notes |
|------|------|-------|
| \`title\` | Text | Article headline |
| \`body\` | Text | Main body. Supports \`format: "html"\` or \`"markdown"\`. |
| \`heading\`, \`heading1\`–\`heading6\` | Text | Section headings |
| \`intro\` | Text | Introductory paragraph |
| \`byline\` | Text | Author attribution |
| \`caption\` | Text | Caption in article layout |
| \`pullquote\`, \`quote\` | Text | Highlighted quotes |
| \`photo\` | Image | Photograph |
| \`figure\` | Image | Figure with context |
| \`portrait\` | Image | Person image |
| \`video\` | Media | Video player |
| \`audio\` | Media | Audio player |
| \`gallery\` | Container | Photo gallery |
| \`section\`, \`chapter\` | Container | Groups of components |
| \`divider\` | Layout | Horizontal rule |

---

## componentTextStyles

Must include at minimum a \`"default"\` key. Role-scoped defaults use \`"default-<role>"\` keys.

\`\`\`json
"componentTextStyles": {
  "default": { "fontName": "Helvetica", "fontSize": 13, "linkStyle": { "textColor": "#428bca" } },
  "default-body": { "fontName": "Helvetica", "fontSize": 13 },
  "title": { "fontName": "Helvetica-Bold", "fontSize": 30, "hyphenation": false }
}
\`\`\`
`;

  writeFileSync(join(DOCS_DIR, "apple-news-format.md"), md);
  console.log("✓ docs/raw/apple-news-format.md updated");
}

async function main() {
  await Promise.all([updateApiDocs(), updateAnfDocs()]);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
