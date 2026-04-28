import { useMemo } from 'react';
import { locations } from '@contentful/app-sdk';
import ConfigScreen from './locations/ConfigScreen';
import EntrySidebar from './locations/EntrySidebar';
import EntryEditor from './locations/EntryEditor';
import PublishedStoriesPage from './locations/PublishedStoriesPage';
import { useSDK } from '@contentful/react-apps-toolkit';

const ComponentLocationSettings = {
  [locations.LOCATION_APP_CONFIG]: ConfigScreen,
  [locations.LOCATION_ENTRY_SIDEBAR]: EntrySidebar,
  [locations.LOCATION_ENTRY_EDITOR]: EntryEditor,
  [locations.LOCATION_PAGE]: PublishedStoriesPage,
};

const App = () => {
  const sdk = useSDK();
  const Component = useMemo(() => {
    for (const [location, component] of Object.entries(ComponentLocationSettings)) {
      if (sdk.location.is(location)) return component;
    }
  }, [sdk.location]);
  return Component ? <Component /> : null;
};

export default App;
