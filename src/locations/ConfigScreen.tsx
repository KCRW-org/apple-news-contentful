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

const ConfigScreen = () => {
  const [parameters, setParameters] = useState<AppInstallationParameters>({});
  const sdk = useSDK<ConfigAppSDK>();

  const onConfigure = useCallback(async () => {
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

        <FormControl>
          <FormControl.Label>Article Customizations (JSON)</FormControl.Label>
          <Textarea
            value={parameters.articleCustomizationsJson ?? ''}
            name="articleCustomizationsJson"
            rows={8}
            onChange={updateParam('articleCustomizationsJson')}
            placeholder='{"componentStyles":{"titleStyle":{"textColor":"#FF1330"}}}'
          />
          <FormControl.HelpText>
            JSON object deep-merged over the generated article document. Use this to
            override styles, layouts, or typography without modifying code.
          </FormControl.HelpText>
        </FormControl>
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
