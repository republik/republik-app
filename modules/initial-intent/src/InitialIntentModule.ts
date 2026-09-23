import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

export interface IntentRecord {
  /** dataString of an ACTION_VIEW intent, null for anything else */
  url: string | null;
  /** where the intent was captured: "onCreate" | "onNewIntent" | "current" */
  source: string;
  /** Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY - relaunch from the Recents screen */
  fromHistory: boolean;
  /** System.currentTimeMillis() when the intent was captured */
  at: number;
}

declare class InitialIntentModule extends NativeModule {
  /**
   * Returns every intent captured since the last call and clears the buffer.
   * Oldest first.
   */
  drainIntents(): Promise<IntentRecord[]>;
}

// This module only applies to Android
export default Platform.select({
  android: () => requireNativeModule<InitialIntentModule>("InitialIntent"),
  default: () => ({
    drainIntents: async (): Promise<IntentRecord[]> => [],
  }),
})();
