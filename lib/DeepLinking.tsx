import { useEffect } from "react";
import * as Linking from "expo-linking";

import { useGlobalState } from "@/lib/GlobalState";
import { rewriteBaseUrl, devLog } from "@/constants/constants";

const DeepLinkingService = () => {
  const { setGlobalState } = useGlobalState();

  useEffect(() => {
    const handleOpenURL = ({ url }: { url: string }) => {
      devLog("handleOpenURL", url);
      // Don't navigate if trackplayer url
      if (url === "trackplayer://notification.click") {
        return;
      }
      setGlobalState({ pendingUrl: rewriteBaseUrl(url) });
    };

    const onInitialUrl = (url: string | null) => {
      if (url) {
        handleOpenURL({ url });
      }
      setGlobalState({ deepLinkingReady: true });
    };
    const onInitialError = (error: any) => {
      console.error("getInitialURL", error);
      setGlobalState({ deepLinkingReady: true });
    };

    // if (Platform.OS === "android") {
    //   // work around regular Linking.getInitialURL promise never returning after a force quite
    //   // https://github.com/facebook/react-native/issues/25675#issuecomment-612249911
    //   const NativeLinking =
    //     require("react-native/Libraries/Linking/NativeIntentAndroid").default;
    //   NativeLinking.getInitialURL().then(onInitialUrl).catch(onInitialError);
    // } else {
    Linking.getInitialURL().then(onInitialUrl).catch(onInitialError);
    // }

    // max wait on initial url
    // - secondary workaround against React Native bug on Android
    // - https://github.com/facebook/react-native/issues/25675
    const timeout = setTimeout(() => {
      setGlobalState({ deepLinkingReady: true });
    }, 15000);

    Linking.addEventListener("url", handleOpenURL);
    return () => {
      clearTimeout(timeout);
    };
  }, [setGlobalState]);

  return null;
};

export default DeepLinkingService;
