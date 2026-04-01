/**
 * Prints the ANF JSON for a given entry without publishing to Apple News.
 * Usage: npm run preview-article:dev -- <entryId>
 */
import { createClient } from 'contentful-management';
import { accessToken, spaceId, environmentId, contentfulHost } from './imports';
import { resolveStory } from '../lib/fetch';
import { buildArticle } from '../lib/article';
import type { AppInstallationParameters } from '../types';

const entryId = process.argv[2];
if (!entryId) {
  console.error('Usage: npm run preview-article:dev -- <entryId>');
  process.exit(1);
}

const params: AppInstallationParameters = {
  locale: process.env.LOCALE ?? 'en-US',
  canonicalUrlTemplate: process.env.CANONICAL_URL_TEMPLATE ?? '',
  footerText: process.env.FOOTER_TEXT,
  articleCustomizationsJson: process.env.ARTICLE_CUSTOMIZATIONS_JSON,
};

const main = async () => {
  const host = contentfulHost || 'api.contentful.com';
  const cma = createClient({ accessToken, host }, { type: 'plain' });
  const story = await resolveStory(entryId, params, { cma, spaceId, environmentId });
  const article = buildArticle(entryId, story, params);
  console.log(JSON.stringify(article, null, 2));
};

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
