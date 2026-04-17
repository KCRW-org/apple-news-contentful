/**
 * Builds and downloads an Apple News .news bundle for local preview in the News Preview macOS app.
 *
 * Reads draft + published content via the Content Preview API (CPA), resolves the story into ANF,
 * downloads every image referenced by the article, and packages `article.json` + bundled images
 * into a zip.
 *
 * Runs entirely in the browser — no App Action round-trip needed.
 *
 * Why bundle every image instead of mixing remote URLs for published assets?
 * The preview is meant to be a self-contained snapshot an editor can hand off: email to a
 * designer, open on a plane, archive for a month. Referencing live CDN URLs undermines that —
 * the bundle would silently change (or break) as assets get edited or unpublished later.
 * The bandwidth cost (a few MB of WebP-compressed images) is negligible for an on-demand
 * editor action.
 */
import JSZip from 'jszip';
import { resolveStory } from '../lib/fetch';
import { createDeliveryEntrySource } from '../lib/entrySource';
import { buildArticle } from '../lib/article';
import { siteConfig } from '../lib/site';
import type { AppInstallationParameters, ResolvedImage, ResolvedStory } from '../types';

export type DownloadPreviewOptions = {
  entryId: string;
  params: AppInstallationParameters;
  spaceId: string;
  environmentId: string;
  /** Defaults to the story's title slugified; used as the zip filename (without extension). */
  filenameBase?: string;
};

export type DownloadPreviewResult = {
  /** Non-fatal warnings — story resolution issues, image fetch failures, etc. */
  warnings: string[];
  /** Number of images successfully bundled into the zip. */
  bundledCount: number;
};

/**
 * Entry point. Fetches, builds, bundles, and triggers a browser download.
 * Throws on hard failures (missing CPA token, story not found). Soft failures
 * (e.g. a single image download failing) are recorded in the returned warnings; the
 * affected image falls back to its remote URL so the rest of the preview still works.
 */
export async function downloadPreview(opts: DownloadPreviewOptions): Promise<DownloadPreviewResult> {
  const { entryId, params, spaceId, environmentId } = opts;
  const locale = params.locale ?? 'en-US';

  if (!params.cpaToken) {
    throw new Error('Content Preview API token not configured. Add it in the app settings.');
  }

  const source = createDeliveryEntrySource({
    baseUrl: 'https://preview.contentful.com',
    token: params.cpaToken,
    spaceId,
    environmentId,
    locale,
  });

  const story = await resolveStory(entryId, params, source);
  const warnings = [...story.warnings];

  const slots = collectImageSlots(story);
  const bundledFiles: { filename: string; blob: Blob }[] = [];

  await Promise.all(
    slots.map(async ({ image, set, role }) => {
      const bundled = await bundleImage(image, role, warnings);
      if (bundled) {
        set(`bundle://${bundled.filename}`);
        bundledFiles.push(bundled);
      }
      // If bundling failed, image.url is left at its remote URL — the preview app will fall back
      // to fetching over the network where possible, and the user sees a warning.
    }),
  );

  const articleJson = buildArticle(entryId, story, params);

  // Assemble the .news bundle: article.json at the root + each bundled image at the root.
  // Apple's News Preview app expects `bundle://filename.ext` references to resolve relative to
  // the zip root, so we don't nest anything in subfolders.
  const zip = new JSZip();
  zip.file('article.json', JSON.stringify(articleJson, null, 2));
  zip.file('metadata.json', JSON.stringify({ data: { isPreview: true, ...siteConfig.resolveArticleMetadata(story) } }, null, 2));
  for (const { filename, blob } of bundledFiles) {
    zip.file(filename, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filenameBase = opts.filenameBase ?? slugify(story.title || entryId);
  triggerDownload(zipBlob, `${filenameBase}.news.zip`);

  return { warnings, bundledCount: bundledFiles.length };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectImageSlots(story: ResolvedStory): Array<{
  image: ResolvedImage;
  set: (url: string) => void;
  role: string;
}> {
  const slots: Array<{ image: ResolvedImage; set: (url: string) => void; role: string }> = [];
  if (story.leadImage) {
    const leadImage = story.leadImage;
    slots.push({ image: leadImage, set: url => { leadImage.url = url; }, role: 'lead' });
  }
  for (const [, embed] of story.embedMap) {
    if (embed.type === 'photo') {
      slots.push({ image: embed, set: url => { embed.url = url; }, role: 'body' });
    }
  }
  return slots;
}

/**
 * Downloads the scaled image bytes for bundling. Returns null on failure (caller leaves
 * the image at its remote URL as a fallback and surfaces a warning).
 */
async function bundleImage(
  image: ResolvedImage,
  role: string,
  warnings: string[],
): Promise<{ filename: string; blob: Blob } | null> {
  try {
    const resp = await fetch(image.url);
    if (!resp.ok) {
      warnings.push(
        `Could not download ${role} image (HTTP ${resp.status}); the preview will reference the remote URL and may not render offline.`,
      );
      return null;
    }
    const blob = await resp.blob();
    const filename = bundleFilenameFor(image, role, blob.type);
    return { filename, blob };
  } catch (err) {
    warnings.push(
      `Could not download ${role} image; the preview will reference the remote URL. ${errMsg(err)}`,
    );
    return null;
  }
}

function bundleFilenameFor(image: ResolvedImage, role: string, mimeType: string): string {
  const ext = extFromMime(mimeType) ?? extFromUrl(image.url) ?? 'bin';
  const base = image.id ? `asset-${image.id}` : `image-${role}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}.${ext}`;
}

function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
  };
  return map[mime.toLowerCase()] ?? null;
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Prefer the `fm` param we set ourselves; fall back to the path extension.
    const fm = u.searchParams.get('fm');
    if (fm) return fm;
    const match = u.pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'preview';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay so the browser has time to initiate the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
