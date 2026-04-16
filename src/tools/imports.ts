import manifest from '../../contentful-app-manifest.json';
import assert from 'assert';
import * as dotenv from 'dotenv';
dotenv.config();

assert.equal(typeof manifest, 'object', 'Manifest is not an object');
assert.ok(Array.isArray(manifest.functions), 'Functions must be an array in the manifest');

const {
  CONTENTFUL_ORG_ID: organizationId = '',
  CONTENTFUL_APP_DEF_ID: appDefinitionId = '',
  CONTENTFUL_ACCESS_TOKEN: accessToken = '',
  CONTENTFUL_HOST: contentfulHost = '',
  CONTENTFUL_SPACE_ID: spaceId = '',
  CONTENTFUL_ENVIRONMENT_ID: environmentId = 'master',
  CONTENTFUL_CPA_TOKEN: cpaToken = '',
  CONTENTFUL_CDA_TOKEN: cdaToken = '',
} = process.env;

assert.ok(organizationId !== '', 'CONTENTFUL_ORG_ID must be set');
assert.ok(appDefinitionId !== '', 'CONTENTFUL_APP_DEF_ID must be set');
assert.ok(accessToken !== '', 'CONTENTFUL_ACCESS_TOKEN must be set');

export {
  organizationId,
  appDefinitionId,
  accessToken,
  contentfulHost,
  spaceId,
  environmentId,
  cpaToken,
  cdaToken,
  manifest,
};
