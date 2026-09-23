import * as Crypto from "expo-crypto";

export type NavigationSource = "deepLink" | "push" | "back";

/**
 * Higher wins. A deep link is an explicit, just-performed user action and must
 * never be overwritten by a buffered push notification response.
 */
const PRIORITY: Record<NavigationSource, number> = {
  deepLink: 30,
  push: 20,
  back: 10,
};

/** Same url arriving twice within this window is treated as one intent. */
const DEDUPE_WINDOW = 1500;

export interface NavigationIntent {
  id: string;
  /** already passed through rewriteBaseUrl */
  url: string;
  source: NavigationSource;
  /** produced while resolving the launch (intent drain / getInitialURL / last notification response) */
  coldStart: boolean;
  at: number;
}

export const makeIntent = (
  url: string,
  source: NavigationSource,
  coldStart: boolean
): NavigationIntent => ({
  id: Crypto.randomUUID(),
  url,
  source,
  coldStart,
  at: Date.now(),
});

/**
 * Decide which of two competing intents wins. Pure and order-independent: the
 * outcome is the same whichever of the producers resolves first.
 */
export const preferIntent = (
  current: NavigationIntent | null | undefined,
  next: NavigationIntent
): NavigationIntent => {
  if (!current) {
    return next;
  }
  // a live user action always beats anything buffered from launch
  if (!next.coldStart && current.coldStart) {
    return next;
  }
  if (next.coldStart && !current.coldStart) {
    return current;
  }
  // same target arriving through two paths (native module event + RN url event)
  if (next.url === current.url && next.at - current.at < DEDUPE_WINDOW) {
    return current;
  }
  const nextPriority = PRIORITY[next.source];
  const currentPriority = PRIORITY[current.source];
  if (nextPriority !== currentPriority) {
    return nextPriority > currentPriority ? next : current;
  }
  return next.at >= current.at ? next : current;
};
