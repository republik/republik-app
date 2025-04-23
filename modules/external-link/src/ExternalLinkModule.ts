import { NativeModule, requireNativeModule } from 'expo';

declare class ExternalLinkModule extends NativeModule {
  canOpenExternalLinkHelper(): Promise<boolean>;
  openExternalLinkHelper(): Promise<boolean>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExternalLinkModule>('ExternalLink');
