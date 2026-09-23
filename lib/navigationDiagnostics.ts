import * as Sentry from "@sentry/react-native";

/**
 * Navigation diagnostics.
 *
 * Deliberately uses `console.log` and not `devLog` from constants/constants.ts:
 * `devLog` is a no-op outside development, but these lines have to be readable
 * in a release build on a real device via
 *   adb logcat -s ReactNativeJS:V
 * while we confirm which source supplied the initial URL.
 */
export const logNav = (event: string, data?: Record<string, unknown>) => {
  console.log(`[Nav] ${event}`, data ?? {});
  Sentry.addBreadcrumb({
    category: "navigation",
    level: "info",
    message: event,
    data,
  });
};

export const tagInitialSource = (source: string) => {
  Sentry.setTag("nav_initial_source", source);
};
