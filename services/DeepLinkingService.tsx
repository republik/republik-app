import { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";

import { useGlobalState } from "@/lib/GlobalState";
import { rewriteBaseUrl, devLog } from "@/constants/constants";
import { makeIntent } from "@/lib/NavigationIntent";
import { logNav, tagInitialSource } from "@/lib/navigationDiagnostics";
import InitialIntent, { IntentRecord } from "@/modules/initial-intent";

/** Hard bound on how long the launch is allowed to wait for an initial URL. */
const INITIAL_URL_TIMEOUT = 2000;
/** Ignore buffered intents that clearly predate this JS session. */
const MAX_RECORD_AGE = 60000;

interface InitialUrlResult {
  url: string | null;
  source: string;
}

const isIgnoredUrl = (url: string) => url === "trackplayer://notification.click";

/**
 * Android: ask the native buffer what intents MainActivity actually received.
 *
 * Linking.getInitialURL() reads activity.getIntent(), which on a cold start
 * where the process was killed but the task survived in Recents still holds the
 * intent that originally created the task - an old deep link. The fresh intent
 * arrives via onNewIntent before the React context exists and is dropped by RN.
 * See modules/initial-intent for the full explanation.
 */
const resolveFromNativeIntents = async (): Promise<InitialUrlResult | null> => {
  if (Platform.OS !== "android") {
    return null;
  }
  let records: IntentRecord[] = [];
  try {
    records = await InitialIntent.drainIntents();
  } catch (error) {
    logNav("initial.drainFailed", { error: String(error) });
    return null;
  }
  logNav("initial.drained", { count: records.length, records });
  if (!records.length) {
    return null;
  }
  const now = Date.now();
  const fresh = records.filter((record) => now - record.at < MAX_RECORD_AGE);
  const newest = [...fresh].reverse();
  const isUsable = (record: IntentRecord) => !!record.url && !record.fromHistory;

  // An onNewIntent record is the link the user just tapped, so it outranks the
  // intent the activity happens to hold.
  const usable =
    newest.find((record) => record.source === "onNewIntent" && isUsable(record)) ??
    newest.find(isUsable);
  if (usable?.url) {
    return { url: usable.url, source: usable.source };
  }
  // Launched from Recents: there is no new link to follow, and getIntent()
  // would hand back the stale one. Report "no url" instead of falling through.
  if (fresh.some((record) => record.fromHistory)) {
    return { url: null, source: "history" };
  }
  return null;
};

const resolveInitialUrl = async (): Promise<InitialUrlResult> => {
  const native = await resolveFromNativeIntents();
  if (native) {
    return native;
  }
  try {
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), INITIAL_URL_TIMEOUT)
    );
    const result = await Promise.race([Linking.getInitialURL(), timeout]);
    if (result === "timeout") {
      return { url: null, source: "timeout" };
    }
    return { url: result ?? null, source: result ? "getInitialURL" : "none" };
  } catch (error) {
    console.error("getInitialURL", error);
    return { url: null, source: "error" };
  }
};

const DeepLinkingService = () => {
  const { setGlobalState, requestNavigation } = useGlobalState();

  useEffect(() => {
    let cancelled = false;

    const handleUrl = (url: string, coldStart: boolean) => {
      devLog("handleOpenURL", url);
      // Don't navigate if trackplayer url
      if (isIgnoredUrl(url)) {
        logNav("deeplink.ignored", { url });
        return;
      }
      const target = rewriteBaseUrl(url);
      logNav(coldStart ? "deeplink.initial" : "deeplink.event", { url, target });
      requestNavigation(makeIntent(target, "deepLink", coldStart));
    };

    // Registered before any async work, so a link arriving while the initial
    // URL is still being resolved cannot be lost.
    const subscription = Linking.addEventListener("url", ({ url }) =>
      handleUrl(url, false)
    );

    resolveInitialUrl()
      .then((result) => {
        if (cancelled) {
          return;
        }
        logNav("deeplink.resolved", { ...result });
        tagInitialSource(result.source);
        if (result.url) {
          handleUrl(result.url, true);
        }
      })
      .finally(() => {
        setGlobalState({ deepLinkingReady: true });
      });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [setGlobalState, requestNavigation]);

  return null;
};

export default DeepLinkingService;
