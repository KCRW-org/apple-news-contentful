import React, { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Heading,
  Form,
  Flex,
  TextInput,
  FormControl,
  Textarea,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import type { AppInstallationParameters } from '../types';

function parseJsonError(value: string, e: SyntaxError): string {
  // V8 (Chrome/Node): "Unexpected token } in JSON at position 42"
  const posMatch = e.message.match(/at position (\d+)/);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const before = value.slice(0, pos).split('\n');
    const line = before.length;
    const col = before[before.length - 1].length + 1;
    return `Invalid JSON — line ${line}, column ${col}`;
  }
  // Firefox: "JSON.parse: ... at line 3 column 1 of the JSON data"
  const lineColMatch = e.message.match(/at line (\d+) column (\d+)/);
  if (lineColMatch) {
    return `Invalid JSON — line ${lineColMatch[1]}, column ${lineColMatch[2]}`;
  }
  return `Invalid JSON: ${e.message}`;
}

const ConfigScreen = () => {
  const [parameters, setParameters] = useState<AppInstallationParameters>({});
  const [customizationsError, setCustomizationsError] = useState<string | null>(null);
  const [sectionMappingError, setSectionMappingError] = useState<string | null>(null);
  const sdk = useSDK<ConfigAppSDK>();

  const onConfigure = useCallback(async () => {
    let blocked = false;
    if (parameters.articleCustomizationsJson?.trim()) {
      try { JSON.parse(parameters.articleCustomizationsJson); }
      catch (err) {
        setCustomizationsError(parseJsonError(parameters.articleCustomizationsJson, err as SyntaxError));
        blocked = true;
      }
    }
    if (parameters.sectionMappingJson?.trim()) {
      try { JSON.parse(parameters.sectionMappingJson); }
      catch (err) {
        setSectionMappingError(parseJsonError(parameters.sectionMappingJson, err as SyntaxError));
        blocked = true;
      }
    }
    if (blocked) return false;
    const currentState = await sdk.app.getCurrentState();
    return { parameters, targetState: currentState };
  }, [parameters, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(onConfigure);
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const currentParameters: AppInstallationParameters | null = await sdk.app.getParameters();
      if (currentParameters) setParameters(currentParameters);
      sdk.app.setReady();
    })();
  }, [sdk]);

  function updateParam<T extends keyof AppInstallationParameters>(key: T) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setParameters(prev => ({ ...prev, [key]: e.target.value }));
    };
  }

  return (
    <Flex flexDirection="column" margin="spacingL">
      <Heading>Apple News Publisher — App Config</Heading>
      <Form>
        <FormControl isRequired isInvalid={!parameters.apiKeyId}>
          <FormControl.Label>API Key ID</FormControl.Label>
          <TextInput
            value={parameters.apiKeyId ?? ''}
            name="apiKeyId"
            onChange={updateParam('apiKeyId')}
          />
          {!parameters.apiKeyId && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.apiKeySecret}>
          <FormControl.Label>API Key Secret</FormControl.Label>
          <TextInput
            value={parameters.apiKeySecret ?? ''}
            name="apiKeySecret"
            type="password"
            onChange={updateParam('apiKeySecret')}
          />
          <FormControl.HelpText>
            Base64-encoded Apple News API key secret.
          </FormControl.HelpText>
          {!parameters.apiKeySecret && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.channelId}>
          <FormControl.Label>Channel ID</FormControl.Label>
          <TextInput
            value={parameters.channelId ?? ''}
            name="channelId"
            onChange={updateParam('channelId')}
          />
          {!parameters.channelId && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.cdaToken}>
          <FormControl.Label>Content Delivery API Token</FormControl.Label>
          <TextInput
            value={parameters.cdaToken ?? ''}
            name="cdaToken"
            type="password"
            onChange={updateParam('cdaToken')}
          />
          <FormControl.HelpText>
            Contentful Content Delivery API access token. Used by the App Action to read
            published entries when sending to Apple News — the CDA guarantees only published
            content is returned, so draft changes never leak into articles.
          </FormControl.HelpText>
          {!parameters.cdaToken && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={!parameters.cpaToken}>
          <FormControl.Label>Content Preview API Token</FormControl.Label>
          <TextInput
            value={parameters.cpaToken ?? ''}
            name="cpaToken"
            type="password"
            onChange={updateParam('cpaToken')}
          />
          <FormControl.HelpText>
            Contentful Content Preview API token. Used by the browser download-preview
            to read draft content so editors can inspect unpublished changes before publishing.
          </FormControl.HelpText>
          {!parameters.cpaToken && (
            <FormControl.ValidationMessage>Required.</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl>
          <FormControl.Label>Canonical URL Template</FormControl.Label>
          <TextInput
            value={parameters.canonicalUrlTemplate ?? ''}
            name="canonicalUrlTemplate"
            onChange={updateParam('canonicalUrlTemplate')}
            placeholder="https://www.example.org/stories/{slug}"
          />
          <FormControl.HelpText>
            Used for the article&apos;s canonical web URL. Supports{' '}
            <code>{'{slug}'}</code>. For stories with shows:{' '}
            <code>https://www.example.org/shows/{'{parentSlug}'}/stories/{'{slug}'}</code>.
            Internal rich text hyperlinks also use this base domain. Leave blank to omit.
          </FormControl.HelpText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Locale</FormControl.Label>
          <TextInput
            value={parameters.locale ?? ''}
            name="locale"
            onChange={updateParam('locale')}
            placeholder="en-US"
          />
          <FormControl.HelpText>
            The Contentful locale to read fields from. Defaults to &ldquo;en-US&rdquo;.
          </FormControl.HelpText>
        </FormControl>

        <FormControl>
          <FormControl.Label>Footer Text</FormControl.Label>
          <TextInput
            value={parameters.footerText ?? ''}
            name="footerText"
            onChange={updateParam('footerText')}
            placeholder="Member-supported news"
          />
          <FormControl.HelpText>
            Optional plain text appended as a footer component to every article.
          </FormControl.HelpText>
        </FormControl>

        <FormControl isInvalid={customizationsError !== null}>
          <FormControl.Label>Article Customizations (JSON)</FormControl.Label>
          <Textarea
            value={parameters.articleCustomizationsJson ?? ''}
            name="articleCustomizationsJson"
            rows={8}
            onChange={e => {
              updateParam('articleCustomizationsJson')(e);
              if (customizationsError) {
                try { JSON.parse(e.target.value); setCustomizationsError(null); } catch { /* still invalid */ }
              }
            }}
            onBlur={e => {
              const value = e.target.value.trim();
              if (!value) { setCustomizationsError(null); return; }
              try { JSON.parse(value); setCustomizationsError(null); }
              catch (err) { setCustomizationsError(parseJsonError(value, err as SyntaxError)); }
            }}
            placeholder='{"componentStyles":{"titleStyle":{"textColor":"#FF1330"}}}'
          />
          <FormControl.HelpText>
            JSON object deep-merged over the generated article document. Use this to
            override styles, layouts, or typography without modifying code.
          </FormControl.HelpText>
          {customizationsError && (
            <FormControl.ValidationMessage>{customizationsError}</FormControl.ValidationMessage>
          )}
        </FormControl>

        <FormControl isInvalid={sectionMappingError !== null}>
          <FormControl.Label>Section Mapping (JSON)</FormControl.Label>
          <Textarea
            value={parameters.sectionMappingJson ?? ''}
            name="sectionMappingJson"
            rows={4}
            onChange={e => {
              updateParam('sectionMappingJson')(e);
              if (sectionMappingError) {
                try { JSON.parse(e.target.value); setSectionMappingError(null); } catch { /* still invalid */ }
              }
            }}
            onBlur={e => {
              const value = e.target.value.trim();
              if (!value) { setSectionMappingError(null); return; }
              try { JSON.parse(value); setSectionMappingError(null); }
              catch (err) { setSectionMappingError(parseJsonError(value, err as SyntaxError)); }
            }}
            placeholder='{"categoryEntryId":"appleSectionId"}'
          />
          <FormControl.HelpText>
            Maps Contentful category entry IDs to Apple News section IDs.
            Use an empty-string key (<code>{'"":"sectionId"'}</code>) for a default
            section that applies to every article. Unmapped categories are ignored.
          </FormControl.HelpText>
          {sectionMappingError && (
            <FormControl.ValidationMessage>{sectionMappingError}</FormControl.ValidationMessage>
          )}
        </FormControl>
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
