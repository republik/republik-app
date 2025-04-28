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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
TrackPlayer.registerPlaybackService(() => require("../services/PlaybackService.ts"));
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {

  const [isAudioPlayerReady, setIsAudioPlayerReady] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
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
}
