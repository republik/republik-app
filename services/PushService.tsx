import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { useGlobalState } from "@/lib/GlobalState";
import { APP_VERSION, rewriteBaseUrl } from "@/constants/constants";
import { makeIntent } from "@/lib/NavigationIntent";
import { logNav } from "@/lib/navigationDiagnostics";

/**
 * Stable identity of a tapped notification response.
 *
 * getLastNotificationResponseAsync() keeps handing back the same response on
 * every cold start, so without this the app would reopen an old notification
 * target forever. Android FCM identifiers can repeat, hence date + url too.
 */
const responseKey = (response: Notifications.NotificationResponse) => {
  const { notification } = response;
  const data =
    Platform.OS === "ios"
      ? // @ts-ignore
        notification.request.trigger?.payload
      : notification.request.content.data;
  return [
    notification.request.identifier,
    notification.date ?? "",
    data?.url ?? "",
  ].join("|");
};

/** The Web gate waits on pushReady, so this call must never hang the launch. */
const LAST_RESPONSE_TIMEOUT = 2000;

function handleRegistrationError(errorMessage: string) {
  console.warn(errorMessage);
  return null;
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      handleRegistrationError(
        "Permission not granted to get push token for push notification!"
      );
      return null;
    }
    try {
      const { data: pushTokenString } =
        await Notifications.getDevicePushTokenAsync();
      console.log("Push token registered:", pushTokenString);
      return pushTokenString;
    } catch (e: unknown) {
      handleRegistrationError(`Push token registration failed: ${e}`);
      return null;
    }
  } else {
    handleRegistrationError("Must use physical device for push notifications");
    return null;
  }
}

const PushService = () => {
  const {
    globalState: { persistedStateReady },
    persistedState: { isSignedIn, handledNotificationKey },
    setGlobalState,
    setPersistedState,
    requestNavigation,
    dispatch,
  } = useGlobalState();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const coldStartCheckedRef = useRef(false);

  const onNotificationOpened = (
    notification: Notifications.Notification,
    coldStart: boolean
  ) => {
    // there seems to be a bug in the response object of the notification listener
    // it is inconsistent between iOS and Android see:
    // https://github.com/expo/expo/issues/27503#issuecomment-2488333935
    const data =
      Platform.OS === "ios"
        ? // @ts-ignore
          notification.request.trigger?.payload
        : notification.request.content.data;
    if (!data) {
      return;
    }
    
    if (data.type === "authorization") {
      // authorization only doesn't trigger navigation
      // webview listens to appstate and triggers login overlay
      return;
    }
    if (data.url) {
      const target = rewriteBaseUrl(data.url);
      logNav("push.navigate", { url: data.url, target, coldStart });
      requestNavigation(makeIntent(target, "push", coldStart));
    }
  };

  useEffect(() => {
    // Wait for the MMKV read. Flipping pushReady on the first pass (while
    // isSignedIn was still undefined) opened the Web gate before the
    // cold-start notification check had even started.
    if (!persistedStateReady) {
      return;
    }

    const checkInitialNotification = async () => {
      try {
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), LAST_RESPONSE_TIMEOUT)
        );
        const initialNotification = await Promise.race([
          Notifications.getLastNotificationResponseAsync(),
          timeout,
        ]);
        if (
          initialNotification &&
          initialNotification.actionIdentifier ===
            Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          const key = responseKey(initialNotification);
          const reused = key === handledNotificationKey;
          logNav("push.lastResponse", { key, reused });
          if (!reused) {
            setPersistedState({ handledNotificationKey: key });
            onNotificationOpened(initialNotification.notification, true);
          }
        }
        // Clears the in-memory copy. On Android that copy is rebuilt from the
        // launching intent, which is why the persisted key above - not this
        // call - is the actual guard against replaying an old response.
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        console.error("getInitialNotification", error);
      }
      setGlobalState({ pushReady: true });
    };

    if (!coldStartCheckedRef.current) {
      coldStartCheckedRef.current = true;
      checkInitialNotification();
    }

    if (!isSignedIn) {
      return;
    }

    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) {
          dispatch({
            type: "postMessage",
            content: {
              type: "onPushRegistered",
              data: {
                token: token,
                os: Platform.OS,
                osVersion: Platform.Version,
                brand: Device.brand,
                model: Device.modelName,
                deviceId: Device.modelId,
                appVersion: APP_VERSION,
                userAgent: `${Device} RepublikApp/${APP_VERSION}`,
              },
            },
          });
        }
      })
      .catch((error: any) => console.warn(error));

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        setPersistedState({ handledNotificationKey: responseKey(response) });
        onNotificationOpened(response.notification, false);
      });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        if (data?.type === "authorization") {
          dispatch({
            type: "postMessage",
            content: {
              type: "authorization",
              url: data.url,
            },
          });
          return;
        }
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [
    persistedStateReady,
    isSignedIn,
    handledNotificationKey,
    dispatch,
    setGlobalState,
    setPersistedState,
    requestNavigation,
  ]);

  return null;
};

export default PushService;
