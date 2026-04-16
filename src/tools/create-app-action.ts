import contentfulManagement from 'contentful-management';
const { createClient } = contentfulManagement;
import { organizationId, appDefinitionId, accessToken, contentfulHost, manifest } from './imports';

const host = contentfulHost || 'api.contentful.com';
const client = createClient({ accessToken, host }, { type: 'plain' });
const functionId = manifest.functions[0].id;

const main = async () => {
  const result = await client.appAction.create(
    { organizationId, appDefinitionId },
    {
      id: 'publishToAppleNews',
      type: 'function-invocation',
      function: {
        sys: { type: 'Link', linkType: 'Function', id: functionId },
      },
      category: 'Custom',
      name: 'Publish to Apple News',
      description: 'Publishes, updates, or removes this story in Apple News Publisher.',
      parameters: [
        {
          id: 'entryId',
          name: 'Entry ID',
          description: 'The Contentful entry ID of the story to publish',
          type: 'Symbol',
          required: true,
        },
        {
          id: 'action',
          name: 'Action',
          description: "Optional action: 'checkStatus' or 'delete'. Omit for publish/update.",
          type: 'Symbol',
          required: false,
        },
        {
          id: 'options',
          name: 'Options',
          description: 'JSON-encoded publish options (isPreview, isCandidateToBeFeatured, isSponsored).',
          type: 'Symbol',
          required: false,
        },
      ],
    },
  );
  console.log('App action created:');
  console.dir(result, { depth: 5 });
};

main().catch(err => {
  console.error('Failed to create app action:', err);
  process.exit(1);
});
