import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { useColorContext } from "@/lib/ColorContext";
import { useGlobalState } from "@/lib/GlobalState";
import { useOrientation } from "@/lib/useOrientation";
import * as Device from "expo-device";

export default function CustomStatusBar() {
  const {
    globalState: { isFullscreen },
  } = useGlobalState();
  const { colorSchemeKey, colors } = useColorContext();
  const orientation = useOrientation();
  const isAlwaysHidden =
    orientation === "landscape" && !Device.modelName?.match("iPad");

  useEffect(() => {
    if (Platform.OS === "android") {
      const updateNavigationBar = async () => {
        try {
          const buttonStyle = colorSchemeKey === "dark" ? "light" : "dark";
          await NavigationBar.setButtonStyleAsync(buttonStyle);
          await NavigationBar.setBackgroundColorAsync(colors.default);
          await NavigationBar.setPositionAsync("relative");
        } catch (e) {
          console.warn("Failed to update NavigationBar:", e);
        }
      };
      updateNavigationBar();
    }
  }, [colorSchemeKey, colors.default]);

  return (
    <StatusBar
      style={colorSchemeKey === "dark" ? "light" : "dark"}
      animated
      translucent={true}
      hidden={isFullscreen || isAlwaysHidden}
    />
  );
}
