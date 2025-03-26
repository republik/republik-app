import * as Application from 'expo-application';
import { Platform } from "react-native";
import { parse, format } from 'url'

// support Android Emulator
// https://stackoverflow.com/questions/4336394/webview-and-localhost
const rewriteHost = (value: string) => {
  if (process.env.EXPO_PUBLIC_ENV === "development" && value) {
    return Platform.select({
      ios: value,
      android: value.replace("localhost", "10.0.2.2"),
    });
  }

  return value;
};

export const devLog =
  process.env.EXPO_PUBLIC_ENV === "development"
    ? console.log.bind(console)
    : () => {};

// Base urls
export const FRONTEND_BASE_URL = rewriteHost(
  process.env.EXPO_PUBLIC_FRONTEND_BASE_URL
);
export const frontendBaseUrl = parse(FRONTEND_BASE_URL);
export const rewriteBaseUrl = (url: string) => {
  const originUrl = parse(url);
  originUrl.host = frontendBaseUrl.host;
  originUrl.protocol = frontendBaseUrl.protocol;
  originUrl.port = frontendBaseUrl.port;
  return format(originUrl);
};

// App paths
export const HOME_PATH = "/";
export const CURTAIN_BACKDOOR_PATH =
  process.env.EXPO_PUBLIC_CURTAIN_BACKDOOR_PATH;

// App urls
export const HOME_URL = `${FRONTEND_BASE_URL}${HOME_PATH}`;

// Misc
export const APP_VERSION = Application.nativeApplicationVersion;
export const BUILD_NUMBER = Application.nativeBuildVersion;

// Audio
export const AUDIO_PLAYER_HEIGHT = 68;
export const ANIMATION_DURATION = 150;
export const AUDIO_PLAYER_PROGRESS_HEIGHT = 4;
export const AUDIO_PLAYER_PROGRESS_HITZONE_HEIGHT = 10;
export const AUDIO_PLAYER_EXPANDED_PADDING_X = 16;
