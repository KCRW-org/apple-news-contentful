/**
 * Prints the ANF JSON for a given entry without publishing to Apple News.
 *
 * Usage:
 *   npm run preview-article:dev -- <entryId>           # draft (CPA, default)
 *   npm run preview-article:dev -- <entryId> --published  # published (CDA)
 *
 * Draft mode (default) uses the Content Preview API so editors can inspect
 * unpublished changes. Requires CONTENTFUL_CPA_TOKEN in .env.development.
 *
 * Published mode mirrors what the App Action would send to Apple News — reads
 * the published version via the Content Delivery API. Requires
 * CONTENTFUL_CDA_TOKEN in .env.development.
 */
import { spaceId, environmentId, cpaToken, cdaToken } from './imports';
import { resolveStory } from '../lib/fetch';
import { createDeliveryEntrySource } from '../lib/entrySource';
import { buildArticle } from '../lib/article';
import type { AppInstallationParameters } from '../types';

const args = process.argv.slice(2);
const entryId = args.find(a => !a.startsWith('--'));
const published = args.includes('--published');

if (!entryId) {
  console.error('Usage: npm run preview-article:dev -- <entryId> [--published]');
  process.exit(1);
}

if (published && !cdaToken) {
  console.error('CONTENTFUL_CDA_TOKEN must be set in .env.development for --published mode');
  process.exit(1);
}
if (!published && !cpaToken) {
  console.error('CONTENTFUL_CPA_TOKEN must be set in .env.development');
  process.exit(1);
}

const params: AppInstallationParameters = {
  locale: process.env.LOCALE ?? 'en-US',
  canonicalUrlTemplate: process.env.CANONICAL_URL_TEMPLATE ?? '',
  footerText: process.env.FOOTER_TEXT,
  articleCustomizationsJson: process.env.ARTICLE_CUSTOMIZATIONS_JSON,
};

const main = async () => {
  const locale = params.locale ?? 'en-US';
  const source = createDeliveryEntrySource(
    published
      ? { token: cdaToken, spaceId, environmentId, locale }
      : { baseUrl: 'https://preview.contentful.com', token: cpaToken, spaceId, environmentId, locale },
  );
  const story = await resolveStory(entryId!, params, source);
  const article = buildArticle(entryId!, story, params);
  if (story.warnings.length > 0) {
    for (const w of story.warnings) console.error(`[warning] ${w}`);
  }
  console.log(JSON.stringify(article, null, 2));
};

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
