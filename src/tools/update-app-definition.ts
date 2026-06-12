/**
 * Declares the installation parameter definitions on the AppDefinition,
 * marking the Apple News API key secret and the CDA token as type "Secret".
 *
 * Parameters whose IDs are declared with type "Secret" are redacted when read via
 * the App SDK in the browser or the CMA with a personal access token — their raw
 * values are only available inside Contentful Functions (where this app uses them).
 *
 * `cpaToken` is intentionally NOT declared Secret: the in-browser download-preview
 * feature reads it via the App SDK, which would only ever see the redacted value.
 *
 * NOTE: once `parameters.installation` is defined, the installation parameter
 * schema is closed — Contentful rejects installation saves containing any
 * undeclared key with a 422 ("The property X is not expected"), so EVERY
 * installation parameter must be declared below, not just the secrets.
 * (Verified empirically 2026-06: with only the secrets declared, every
 * config-screen save fails.) Keep this list in sync with
 * `AppInstallationParameters` in src/types.ts.
 *
 * Idempotent — safe to re-run. Run after create-app-definition:
 *   npm run update-app-definition:dev
 */
import contentfulManagement from "contentful-management";
const { createClient } = contentfulManagement;
import type { AppDefinitionProps } from "contentful-management";
import {
  organizationId,
  appDefinitionId,
  accessToken,
  contentfulHost,
} from "./imports";

type InstallationParameterDefinition = NonNullable<
  NonNullable<AppDefinitionProps["parameters"]>["installation"]
>[number];

const host = contentfulHost || "api.contentful.com";
const client = createClient({ accessToken, host }, { type: "plain" });

const INSTALLATION_PARAMETER_DEFINITIONS: InstallationParameterDefinition[] = [
  {
    id: "apiKeyId",
    name: "Apple News API Key ID",
    description: "Apple News API key ID for the channel.",
    type: "Symbol",
    required: true,
  },
  {
    id: "apiKeySecret",
    name: "Apple News API Key Secret",
    description:
      "Base64-encoded Apple News API key secret. Only readable by the App Function.",
    type: "Secret",
    required: true,
  },
  {
    id: "channelId",
    name: "Apple News Channel ID",
    description: "Apple News channel to publish articles into.",
    type: "Symbol",
    required: true,
  },
  {
    id: "cdaToken",
    name: "Content Delivery API Token",
    description:
      "Contentful CDA token used by the App Function to read published entries. Only readable by the App Function.",
    type: "Secret",
    required: true,
  },
  {
    id: "cpaToken",
    name: "Content Preview API Token",
    description:
      "Contentful CPA token used by the in-browser download preview to read drafts. Readable by space users — scope it to this space.",
    type: "Symbol",
    required: true,
  },
  {
    id: "canonicalUrlTemplate",
    name: "Canonical URL Template",
    description:
      "URL template with {slug} / {parentSlug} placeholders for canonical article URLs.",
    type: "Symbol",
  },
  {
    id: "locale",
    name: "Locale",
    description: "Contentful locale to read fields from (defaults to en-US).",
    type: "Symbol",
  },
  {
    id: "footerText",
    name: "Footer Text",
    description:
      "Optional plain text appended as a footer component to every article.",
    type: "Symbol",
  },
  {
    id: "articleCustomizationsJson",
    name: "Article Customizations (JSON)",
    description: "JSON object deep-merged over the generated article document.",
    type: "Symbol",
  },
  {
    id: "sectionMappingJson",
    name: "Section Mapping (JSON)",
    description:
      "JSON map of Contentful category entry ID to Apple News section ID.",
    type: "Symbol",
  },
];

const main = async () => {
  const definition = await client.appDefinition.get({
    organizationId,
    appDefinitionId,
  });
  definition.parameters = {
    ...definition.parameters,
    installation: INSTALLATION_PARAMETER_DEFINITIONS,
  };
  const result = await client.appDefinition.update(
    { organizationId, appDefinitionId },
    definition,
  );
  console.log("App definition updated. Installation parameter definitions:");
  for (const param of result.parameters?.installation ?? []) {
    console.log(
      `  - ${param.id} (${param.type}${param.required ? ", required" : ""})`,
    );
  }
};

main().catch((err) => {
  console.error("Failed to update app definition:", err);
  process.exit(1);
});
