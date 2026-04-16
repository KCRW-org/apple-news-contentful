import type { ImageRole } from '../types';

/** Target widths (in CSS pixels) per image role. Override to retune without touching resolver logic. */
export const IMAGE_TARGET_WIDTHS: Record<ImageRole, number> = {
  lead: 2048,
  body: 1600,
  thumb: 1200,
};

/**
 * Standard Contentful asset field shape returned by both CDA and CPA responses.
 * The `fields` object on an Asset entry always has this structure.
 */
export type ContentfulAssetFields = {
  file?: {
    url?: string;
    details?: { image?: { width?: number; height?: number } };
  };
};

export type ContentfulAssetInfo = {
  id: string | undefined;
  url: string;
  width: number | undefined;
  height: number | undefined;
};

/**
 * Extracts the file URL and image dimensions from a linked Contentful asset entry.
 * Returns null if the asset or its file URL is missing.
 *
 * This is a generic Contentful utility — it reflects the standard asset field
 * structure and does not contain site-specific logic.
 */
export function resolveAssetInfo(
  asset: { sys?: { id?: string }; fields?: ContentfulAssetFields } | undefined,
): ContentfulAssetInfo | null {
  const file = asset?.fields?.file;
  if (!file?.url) return null;
  return {
    id: asset?.sys?.id,
    url: file.url,
    width: file.details?.image?.width,
    height: file.details?.image?.height,
  };
}

/** Joins an array of strings with commas and "and" before the last item. */
export function friendlyStringJoin(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/**
 * Strips Markdown syntax to produce plain text suitable for ANF metadata fields
 * (e.g. excerpt) that do not support markup.
 * Handles: bold/italic, inline code, links, images, headings, blockquotes,
 * horizontal rules, and collapses excess whitespace.
 */
export function stripMarkdown(s: string): string {
  return s
    .replace(/!\[.*?\]\(.*?\)/g, '')           // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')     // links → label text
    .replace(/^#{1,6}\s+/gm, '')               // headings
    .replace(/^>\s+/gm, '')                    // blockquotes
    .replace(/^[-*_]{3,}\s*$/gm, '')           // horizontal rules
    .replace(/`{1,3}[^`]*`{1,3}/g, '')         // inline code / code fences
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold/italic
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

/** ANF thumbnail aspect ratio limits (width ÷ height). */
export const THUMB_MIN_RATIO = 1 / 2; // 1:2 — tallest allowed
export const THUMB_MAX_RATIO = 3 / 1; // 3:1 — widest allowed

/**
 * Builds a Contentful Images API thumbnail URL.
 *
 * Enforces ANF's required 1:2–3:1 aspect ratio by adding an explicit `h` when the
 * image's natural dimensions fall outside those bounds, choosing whichever limit
 * requires the least cropping.
 *
 * When height clamping is applied, `options.fit` and `options.f` are forwarded
 * as-is to the Images API (e.g. `fit=thumb`, `f=face`). If omitted, no `fit`
 * or `f` params are added.
 */
export function buildThumbnailUrl(
  url: string,
  width: number | undefined,
  height: number | undefined,
  targetW: number,
  options?: { fit?: string; f?: string },
): string {
  const u = new URL(url.startsWith('//') ? `https:${url}` : url);
  u.searchParams.set('w', String(targetW));

  if (width && height) {
    const ratio = width / height;
    let clampedH: number | null = null;

    if (ratio < THUMB_MIN_RATIO) {
      // Too tall (more portrait than 1:2): clamp height to 1:2.
      clampedH = Math.round(targetW / THUMB_MIN_RATIO);
    } else if (ratio > THUMB_MAX_RATIO) {
      // Too wide (more landscape than 3:1): clamp height to 3:1.
      clampedH = Math.round(targetW / THUMB_MAX_RATIO);
    }

    if (clampedH !== null) {
      u.searchParams.set('h', String(clampedH));
      if (options?.fit) u.searchParams.set('fit', options.fit);
      if (options?.f) u.searchParams.set('f', options.f);
    }
  }

  return u.toString();
}

/**
 * Recursively deep-merges `source` into `target`.
 * Arrays in `source` replace arrays in `target` (no concatenation).
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
