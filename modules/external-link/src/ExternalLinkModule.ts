import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

declare class ExternalLinkModule extends NativeModule {
  canOpenExternalLinkHelper(): Promise<boolean>;
  openExternalLinkHelper(): Promise<boolean>;
}

// Create a mock module for Android
const mockModule = {
  canOpenExternalLinkHelper: async (): Promise<boolean> => false,
  openExternalLinkHelper: async (): Promise<boolean> => false,
};

// This module only applies to iOS
export default Platform.select({
  ios: () => requireNativeModule<ExternalLinkModule>('ExternalLink'),
  default: () => mockModule,
})();
