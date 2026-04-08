import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { useGlobalState } from "@/lib/GlobalState";
import { APP_VERSION, rewriteBaseUrl, devLog } from "@/constants/constants";

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
    persistedState: { isSignedIn },
    setGlobalState,
    dispatch,
  } = useGlobalState();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const onNotificationOpened = (notification: Notifications.Notification) => {
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
      setGlobalState({
        pendingUrl: rewriteBaseUrl(data.url),
      });
    }
  };

  useEffect(() => {
    if (!isSignedIn) {
      setGlobalState({ pushReady: true });
      return;
    }

    const checkInitialNotification = async () => {
      try {
        const initialNotification =
          await Notifications.getLastNotificationResponseAsync();
        if (
          initialNotification &&
          initialNotification.actionIdentifier ===
            Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          onNotificationOpened(
            initialNotification.notification
          );
        }
      } catch (error) {
        console.error("getInitialNotification", error);
      }
      setGlobalState({ pushReady: true });
    };

    checkInitialNotification();

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
        onNotificationOpened(response.notification);
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
  }, [isSignedIn, dispatch, setGlobalState]);

  return null;
};

export default PushService;
