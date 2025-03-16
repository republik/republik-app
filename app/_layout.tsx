import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/useColorScheme";
import { GlobalStateProvider } from "@/lib/GlobalState";
import DeepLinkingService from "@/lib/DeepLinking";
import AppStateService from "@/lib/AppState";
import PushService from "@/lib/Push";
import Web from "@/components/Web";
import SetupAudioPlayerSerivce from '@/components/AudioPlayer/SetupAudioPlayerService'
import HeadlessAudioPlayer from '@/components/AudioPlayer/HeadlessAudioPlayer'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [isAudioPlayerReady, setIsAudioPlayerReady] = useState(false)

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  //Initialize the AudioPlayer
  useEffect(() => {
    const run = async () => {
      const nextReadyState = await SetupAudioPlayerSerivce()
      setIsAudioPlayerReady(nextReadyState)
    }
    if (!isAudioPlayerReady) {
      run()
    }
  }, [isAudioPlayerReady, setIsAudioPlayerReady])

  if (!loaded) {
    return null;
  }

  return (
    <GlobalStateProvider>
      <PushService />
      <DeepLinkingService />
      <AppStateService />
      {/* <CookieService /> */}

      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SafeAreaProvider>
          <Web />
        </SafeAreaProvider>
        <StatusBar animated translucent={true} />
      </ThemeProvider>

      {isAudioPlayerReady && <HeadlessAudioPlayer />}
    </GlobalStateProvider>
  );
}
