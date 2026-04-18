import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

declare class ExternalLinkModule extends NativeModule {
  checkCanMakePayments(): Promise<boolean>;
  canOpenExternalLinkHelper(): Promise<boolean>;
  openExternalLinkHelper(): Promise<boolean>;
}

// Create a mock module for Android
const mockModule = {
  checkCanMakePayments: async (): Promise<boolean> => false,
  canOpenExternalLinkHelper: async (): Promise<boolean> => false,
  openExternalLinkHelper: async (): Promise<boolean> => false,
};

// This module only applies to iOS
export default Platform.select({
  ios: () => requireNativeModule<ExternalLinkModule>('ExternalLink'),
  default: () => mockModule,
})();
