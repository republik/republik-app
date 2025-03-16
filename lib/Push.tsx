import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { useGlobalState } from "@/lib/GlobalState";
import { APP_VERSION, rewriteBaseUrl, devLog } from "@/constants/constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function handleRegistrationError(errorMessage: string) {
  alert(errorMessage);
  throw new Error(errorMessage);
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
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) {
      handleRegistrationError("Project ID not found");
    }
    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log(pushTokenString);
      return pushTokenString;
    } catch (e: unknown) {
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError("Must use physical device for push notifications");
  }
}

const PushService = () => {
  const {
    persistedState: { isSignedIn },
    setGlobalState,
    dispatch,
  } = useGlobalState();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (!isSignedIn) {
      setGlobalState({ pushReady: true });
      return;
    }

    const onNotificationOpened = (payload: Record<string, any>) => {
      if (payload?.type === "authorization") {
        // authorization only doesn't trigger navigation
        // webview listens to appstate and triggers login overlay
        return;
      }
      if (payload.url) {
        setGlobalState({
          pendingUrl: rewriteBaseUrl(payload.url),
        });
      }
    };

    // Hanldes if App is woken up from terminated state by a push notification
    if (
      lastNotificationResponse &&
      lastNotificationResponse.notification.request.content.data
    ) {
      onNotificationOpened(
        lastNotificationResponse.notification.request.content.data
      );
    } else {
      console.error("getInitialNotification");
    }

    setGlobalState({ pushReady: true });

    registerForPushNotificationsAsync()
      .then((token) => {
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
      })
      .catch((error: any) => console.warn(error));

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const payload = notification.request.content.data;
        if (payload?.type === "authorization") {
          dispatch({
            type: "postMessage",
            content: {
              type: "authorization",
              url: payload.url,
            },
          });
          return;
        }
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        onNotificationOpened(response.notification.request.content.data);
      });

    return () => {
      notificationListener.current &&
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      responseListener.current &&
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [isSignedIn, dispatch, setGlobalState, lastNotificationResponse]);

  return null;
};

export default PushService;
