import React, { useRef, useState, useEffect, useCallback } from "react";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
} from "react-native-webview/lib/WebViewTypes";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Share, Platform, BackHandler, StatusBar } from "react-native";
import * as Sentry from "@sentry/react-native";

import {
  APP_VERSION,
  FRONTEND_BASE_URL,
  HOME_URL,
  devLog,
  BUILD_NUMBER,
} from "../constants/constants";
import { useGlobalState, Message } from "../lib/GlobalState";
import NetworkError from "./NetworkError";
import Loader from "./Loader";
import { useColorContext } from "@/lib/ColorContext";
import WebViewEventEmitter from "@/lib/WebViewEventEmitter";
import { downloadFile } from "../lib/downloadFile";
import { handleExternalLink } from "../lib/handleExternalLink";
import { makeIntent, NavigationIntent } from "@/lib/NavigationIntent";
import { logNav } from "@/lib/navigationDiagnostics";

/** How long a push-route message gets to be acked before we force the URL in. */
const ROUTE_ACK_TIMEOUT = 2500;
/** How long before we give up entirely and remount the WebView on the URL. */
const ROUTE_REMOUNT_TIMEOUT = 5000;

// Based on react-native-webview injection for Android
// https://github.com/react-native-webview/react-native-webview/blob/194c6a2335b12cc05283413c44d0948eb5156e02/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManager.java#L651-L670
const generateMessageJS = (data: Message) => {
  return [
    "(function(){",
    "var event;",
    `var data = ${JSON.stringify(data)};`,
    "try{",
    'event = new MessageEvent("message",{data});',
    "}catch(e){",
    'event = document.createEvent("MessageEvent");',
    'event.initMessageEvent("message",true,true,data,"","",window);',
    "}",
    "document.dispatchEvent(event);",
    "})();",
    "true;",
  ].join("");
};

const getLast = (array: string[]) => array[array.length - 1];

/** Compare two frontend urls by path + query, ignoring a trailing slash/hash. */
const isSameRoute = (a: string, b: string) => {
  const normalize = (url: string) =>
    url.slice(FRONTEND_BASE_URL.length).split("#")[0].replace(/\/$/, "") || "/";
  return normalize(a) === normalize(b);
};

// Strict same-origin check: rejects e.g. "https://www.republik.chchrome-error://..."
const isFrontendUrl = (url: string | undefined | null): url is string => {
  if (!url || !url.startsWith(FRONTEND_BASE_URL)) return false;
  const next = url.charAt(FRONTEND_BASE_URL.length);
  return next === "" || next === "/" || next === "?" || next === "#";
};

const Web = () => {
  const {
    globalState,
    setGlobalState,
    requestNavigation,
    consumeNavigation,
    persistedState,
    setPersistedState,
    pendingMessages,
    dispatch,
  } = useGlobalState();
  const webviewRef = useRef<WebView>(null);
  const [webUrl, setWebUrl] = useState<string | undefined>();
  const [webViewKey, setWebViewKey] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const { colors, colorSchemeKey } = useColorContext();

  const [history, setHistory] = useState<string[]>([]);
  const historyRef = useRef<string[]>([]);
  historyRef.current = history;

  const { appState } = globalState;
  const [didCrash, setDidCrash] = useState<boolean | undefined>();

  // Message queue for async processing
  const messageQueue = useRef<Array<{
    type: string;
    id: string;
    colorSchemeKey?: string;
    payload: any;
    timestamp: number;
  }>>([]);
  const isProcessingQueue = useRef(false);

  useEffect(() => {
    console.log(appState, didCrash);
    if (didCrash && appState === "active" && webviewRef.current) {
      webviewRef.current.reload();
      setDidCrash(false);
    }
  }, [appState, didCrash]);

  // Android web view does not support media queries
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    // there for we send the os/app color scheme to the web app
    dispatch({
      type: "postMessage",
      content: {
        type: "osColorScheme",
        value: colorSchemeKey,
      },
    });
  }, [colorSchemeKey, dispatch]);

  // Capture Android back button press
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const backAction = () => {
      const currentHistory = historyRef.current;
      if (
        currentHistory?.length === 1 &&
        getLast(currentHistory) === HOME_URL
      ) {
        BackHandler.exitApp();
        return false;
      }
      if (currentHistory?.length) {
        dispatch({
          type: "postMessage",
          content: {
            type: "back",
          },
        });
        // needs to happen after setGlobalState because set happens instantaneously instant in react native
        setHistory(currentHistory.slice(0, currentHistory.length - 1));
        return true;
      }
      requestNavigation(makeIntent(HOME_URL, "back", false));
      return true;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => {
      subscription.remove();
    };
  }, [requestNavigation, dispatch]);

  // A deep link arriving after the WebView has mounted is handed to the web app
  // as a push-route message. That depends on the frontend picking it up, so we
  // fall back to driving the WebView natively if no route change follows.
  const pendingRouteRef = useRef<{
    url: string;
    timers: ReturnType<typeof setTimeout>[];
  } | null>(null);

  const clearPendingRoute = useCallback(() => {
    pendingRouteRef.current?.timers.forEach(clearTimeout);
    pendingRouteRef.current = null;
  }, []);

  useEffect(() => clearPendingRoute, [clearPendingRoute]);

  const navigateLate = useCallback(
    (url: string, withFallback: boolean) => {
      if (!isFrontendUrl(url)) {
        return;
      }
      clearPendingRoute();
      dispatch({
        type: "postMessage",
        content: {
          type: "push-route",
          url: url.slice(FRONTEND_BASE_URL.length) || "/",
        },
      });
      // The in-app back handler already works through push-route alone; only
      // links coming from outside the app get the native fallback.
      if (!withFallback) {
        return;
      }
      const timers = [
        setTimeout(() => {
          logNav("nav.fallback.inject", { url });
          webviewRef.current?.injectJavaScript(
            `window.location.assign(${JSON.stringify(url)});true;`
          );
        }, ROUTE_ACK_TIMEOUT),
        setTimeout(() => {
          logNav("nav.fallback.remount", { url });
          pendingRouteRef.current = null;
          setIsReady(false);
          setWebUrl(url);
          setWebViewKey((key) => key + 1);
        }, ROUTE_REMOUNT_TIMEOUT),
      ];
      pendingRouteRef.current = { url, timers };
    },
    [clearPendingRoute, dispatch]
  );

  const consumedIntentIdRef = useRef<string | null>(null);

  useEffect(() => {
    // wait for all services
    if (
      !globalState.deepLinkingReady ||
      !globalState.pushReady ||
      !globalState.persistedStateReady
    ) {
      return;
    }

    const intent: NavigationIntent | null = globalState.navIntent ?? null;
    if (intent && intent.id !== consumedIntentIdRef.current) {
      consumedIntentIdRef.current = intent.id;
      logNav("nav.resolved", {
        url: intent.url,
        source: intent.source,
        coldStart: intent.coldStart,
        webUrlWasSet: !!webUrl,
      });
      if (webUrl) {
        navigateLate(intent.url, intent.source !== "back");
      } else {
        setWebUrl(intent.url);
      }
      consumeNavigation(intent.id);
      return;
    }

    if (!webUrl && !intent) {
      const restoredUrl = isFrontendUrl(persistedState.url)
        ? persistedState.url
        : HOME_URL;
      logNav("nav.restore", {
        url: restoredUrl,
        stored: persistedState.url ?? null,
      });
      setWebUrl(restoredUrl);
    }
  }, [
    webUrl,
    globalState.deepLinkingReady,
    globalState.pushReady,
    globalState.persistedStateReady,
    globalState.navIntent,
    persistedState.url,
    consumeNavigation,
    navigateLate,
  ]);

  // Surfaces which competing intent lost, e.g. a buffered push response losing
  // to the deep link the user just tapped.
  useEffect(() => {
    const discarded: NavigationIntent | null =
      globalState.navIntentDiscarded ?? null;
    if (discarded) {
      logNav("nav.discarded", {
        url: discarded.url,
        source: discarded.source,
        coldStart: discarded.coldStart,
      });
    }
  }, [globalState.navIntentDiscarded]);

  // Periodic URL sync to guard against OS termination without lifecycle events.
  // Asks the WebView for its actual current URL and persists it via a dedicated
  // "urlSync" message type that does not affect the navigation history stack.
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      if (webviewRef.current) {
        webviewRef.current.injectJavaScript(`
          (function() {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'urlSync', payload: { url: window.location.href } })
            );
          })();
          true;
        `);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isReady]);

  // This effect handles sending queued messages
  useEffect(() => {
    if (!isReady) {
      return; // WebView not ready yet
    }

    const message = pendingMessages.filter((msg) => !msg.mark)[0];
    if (!message) {
      return;
    }
    devLog("postMessage", message);
    webviewRef.current?.injectJavaScript(generateMessageJS(message));
    dispatch({
      type: "markMessage",
      id: message.id,
      mark: true,
    });
    setTimeout(() => {
      dispatch({
        type: "markMessage",
        id: message.id,
        mark: false,
      });
    }, 2 * 1000);
  }, [isReady, pendingMessages, dispatch]);

  // Process a single message from the queue
  const processMessage = async (message: {
    type: string;
    id: string;
    colorSchemeKey?: string;
    payload: any;
    timestamp: number;
  }) => {
    const startTime = Date.now();
    
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          const error = new Error(`WebView message timeout: ${message.type}`);
          error.name = 'WebViewTimeout';
          reject(error);
        }, 3000)
      );

      const processingPromise = async () => {
        switch (message.type) {
          case "routeChange":
            onNavigationStateChange(message.payload);
            break;
          case "urlSync": {
            const syncUrl = message.payload.url;
            if (!isFrontendUrl(syncUrl)) {
              break;
            }
            const shouldPersist = !/\.[a-zA-Z0-9]+$/.test(syncUrl);
            if (shouldPersist && syncUrl !== persistedState.url) {
              console.log(`[Persist] urlSync: ${syncUrl}`);
              setPersistedState({ url: syncUrl });
            }
            break;
          }
          case "share":
            await share(message.payload);
            break;
          case "haptic":
            await Haptics.notificationAsync(message.payload.type);
            break;
          case "play-audio":
            setGlobalState({ autoPlayAudio: message.payload });
            setPersistedState({
              audio: message.payload,
            });
            break;
          case "isSignedIn":
            setPersistedState({ isSignedIn: message.payload });
            break;
          case "fullscreen-enter":
            setGlobalState({ isFullscreen: true });
            break;
          case "fullscreen-exit":
            setGlobalState({ isFullscreen: false });
            break;
          case "setColorScheme":
            setPersistedState({ userSetColorScheme: message.colorSchemeKey });
            break;
          case "ackMessage":
            dispatch({
              type: "clearMessage",
              id: message.id,
            });
            break;
          case "external-link":
            handleExternalLink();
            break;
          default:
            WebViewEventEmitter.emit(message.type, message.payload);
        }
      };

      await Promise.race([processingPromise(), timeoutPromise]);
      
      // Log slow processing
      const processingTime = Date.now() - startTime;
      if (processingTime > 100) {
        console.warn(`Slow message processing [${message.type}]: ${processingTime}ms`);
      }
    } catch (error) {
      console.error(`WebView message error [${message.type}]:`, {
        error,
        queueAge: Date.now() - message.timestamp,
        platform: Platform.OS
      });
      throw error;
    }
  };

  // Process the message queue asynchronously
  const processMessageQueue = async () => {
    if (isProcessingQueue.current || messageQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;

    while (messageQueue.current.length > 0) {
      const message = messageQueue.current.shift();
      if (!message) break;

      try {
        await processMessage(message);
      } catch (error) {
        // Error already logged in processMessage, continue processing queue
        console.error('Queue processing error, continuing...', error);
      }

      // Yield control back to the main thread between messages
      await new Promise(resolve => setImmediate(resolve));
    }

    isProcessingQueue.current = false;
  };

  // Fast, non-blocking message handler - just parse and queue
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const message: {
        type: string;
        id: string;
        colorSchemeKey?: string;
        payload: any;
      } = JSON.parse(e.nativeEvent.data) || {};
      
      devLog("onMessage (queued)", message);
      
      // Add to queue with timestamp
      messageQueue.current.push({
        ...message,
        timestamp: Date.now()
      });

      // Trigger async processing
      setImmediate(() => processMessageQueue());
      
    } catch (error) {
      console.error('WebView message parse error:', {
        error,
        messageSize: e.nativeEvent.data.length,
        platform: Platform.OS
      });
      // Don't throw - keep WebView responsive
    }
  };

  const share = async ({
    url,
    title,
    message,
    subject,
    dialogTitle,
  }: {
    url: string;
    title: string;
    message: string;
    subject: string;
    dialogTitle: string;
  }) => {
    try {
      await Share.share(
        Platform.OS === "ios"
          ? {
              url,
              title,
              message,
            }
          : {
              title,
              message: [message, url].filter(Boolean).join("\n"),
            },
        {
          dialogTitle,
          subject,
        }
      );
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const captureWebViewFailure = (kind: string, summary: string, data: object) => {
    Sentry.captureMessage(`WebView ${kind}: ${summary}`, {
      level: "error",
      contexts: { webview: { ...data, expectedUrl: webUrl } },
    });
  };

  const onWebViewError = (e: WebViewErrorEvent) => {
    const { code, description } = e.nativeEvent;
    captureWebViewFailure("onError", `${code} ${description}`, e.nativeEvent);
  };

  const onWebViewHttpError = (e: WebViewHttpErrorEvent) => {
    const { statusCode, description } = e.nativeEvent;
    captureWebViewFailure(
      "onHttpError",
      `${statusCode} ${description}`,
      e.nativeEvent
    );
  };

  const renderWebViewError = (
    domain: string | undefined,
    code: number,
    description: string
  ) => {
    captureWebViewFailure("renderError", `${code} ${description}`, {
      domain,
      code,
      description,
    });
    return <NetworkError onReload={() => webviewRef.current?.reload()} />;
  };

  const onNavigationStateChange = ({ url: urlInput }: { url: string }) => {
    const url = urlInput.startsWith(FRONTEND_BASE_URL)
      ? urlInput
      : `${FRONTEND_BASE_URL}${urlInput}`;
    if (!isFrontendUrl(url)) {
      return;
    }
    // A route change onto the requested target is the ack for push-route.
    const pendingRoute = pendingRouteRef.current;
    if (pendingRoute && isSameRoute(url, pendingRoute.url)) {
      logNav("nav.ack", { url });
      clearPendingRoute();
    }
    // deduplicate
    // - called by onMessage routeChange and onNavigationStateChange
    //   - iOS triggers onNavigationStateChange for pushState in the web view
    //   - Android does not
    // - onNavigationStateChange is still necessary
    //   - for all route changes via a navigation intent
    //   - e.g. notifications & link opening
    if (url !== persistedState.url) {
      const shouldPersist = !/\.[a-zA-Z0-9]+$/.test(url);
      if (shouldPersist) {
        console.log(`[Persist] routeChange: ${url}`);
        const success = setPersistedState({ url });
        if (!success) {
          console.warn("[Persist] routeChange: MMKV write failed");
        }
      }
    }

    if (getLast(history) !== url) {
      setHistory((currentHistory) => {
        if (getLast(currentHistory) === url) {
          return currentHistory;
        }
        return currentHistory.concat(url);
      });
    }
  };

  return (
    <>
      {webUrl && (
        <SafeAreaView
          style={[
            {
              flex: 1,
              backgroundColor: globalState.isFullscreen
                ? colors.fullScreenStatusBar
                : colors.default,
            },
          ]}
          edges={
            Platform.OS === "android"
              ? ["right", "left", "top", "bottom"]
              : ["right", "left", "top"]
          }
        >
          <WebView
            key={webViewKey}
            ref={webviewRef}
            source={{ uri: webUrl }}
            applicationNameForUserAgent={`RepublikApp/${APP_VERSION}/${BUILD_NUMBER}`}
            onNavigationStateChange={onNavigationStateChange}
            onMessage={onMessage}
            onLoad={() => {
              setIsReady(true);
            }}
            onLoadStart={({ nativeEvent }) => {
              if (isReady && nativeEvent.loading && Platform.OS === "ios") {
                StatusBar.setNetworkActivityIndicatorVisible(true);
              }
            }}
            onLoadEnd={({ nativeEvent }) => {
              if (Platform.OS === "ios") {
                StatusBar.setNetworkActivityIndicatorVisible(false);
              }
            }}
            startInLoadingState
            renderLoading={() => <Loader loading />}
            renderError={renderWebViewError}
            onError={onWebViewError}
            onHttpError={onWebViewHttpError}
            // stripe url's are included to enable prolong
            // delete once shop.republik.ch is live
            originWhitelist={[
              `${FRONTEND_BASE_URL}*`,
              "https://js.stripe.com",
              "https://*.stripecdn.com",
              "https://newassets.hcaptcha.com",
              "https://*.vimeo.com",
              "https://*.vimeocdn.com"
            ]}
            pullToRefreshEnabled={false}
            allowsFullscreenVideo={true}
            allowsInlineMediaPlayback={true}
            sharedCookiesEnabled={true}
            allowsBackForwardNavigationGestures={true}
            automaticallyAdjustContentInsets={false}
            keyboardDisplayRequiresUserAction={false}
            mediaPlaybackRequiresUserAction={false}
            allowsLinkPreview={true}
            scalesPageToFit={false}
            decelerationRate={0.998}
            onRenderProcessGone={() => {
              setDidCrash(true);
            }}
            onContentProcessDidTerminate={() => {
              setDidCrash(true);
            }}
            onFileDownload={({ nativeEvent: { downloadUrl } }) => {
              downloadFile(downloadUrl);
            }}
            style={{ backgroundColor: colors.default }}
          />
        </SafeAreaView>
      )}
    </>
  );
};

export default Web;
