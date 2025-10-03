import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GlobalStateProvider } from "@/lib/GlobalState";
import DeepLinkingService from "@/services/DeepLinkingService";
import AppStateService from "@/services/AppStateService";
import PushService from "@/services/PushService";
import Web from "@/components/Web";
import SetupAudioPlayerSerivce from "@/components/AudioPlayer/SetupAudioPlayerService";
import HeadlessAudioPlayer from "@/components/AudioPlayer/HeadlessAudioPlayer";
import TrackPlayer from "react-native-track-player";
import { ColorContextProvider } from "@/lib/ColorContext";
import StatusBar from "@/components/StatusBar";
import * as Sentry from "@sentry/react-native";
import { Button } from "react-native";

Sentry.init({
  dsn: "https://6905706f3204699528a470e4685c5dc2@o4507101684105216.ingest.de.sentry.io/4510103813816400",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

TrackPlayer.registerPlaybackService(() =>
  require("./services/PlaybackService.ts")
);
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default Sentry.wrap(function RootLayout() {
  const [isAudioPlayerReady, setIsAudioPlayerReady] = useState(false);

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  //Initialize the AudioPlayer
  useEffect(() => {
    const run = async () => {
      const nextReadyState = await SetupAudioPlayerSerivce();
      setIsAudioPlayerReady(nextReadyState);
    };
    if (!isAudioPlayerReady) {
      run();
    }
  }, [isAudioPlayerReady, setIsAudioPlayerReady]);

  return (
    <GlobalStateProvider>
      <PushService />
      <DeepLinkingService />
      <AppStateService />
      <SafeAreaProvider>
        <ColorContextProvider>
          <StatusBar />
          <Web />
          {isAudioPlayerReady && <HeadlessAudioPlayer />}
        </ColorContextProvider>
      </SafeAreaProvider>
    </GlobalStateProvider>
  );
});
