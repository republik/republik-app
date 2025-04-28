import { StatusBar } from "expo-status-bar";
import { useColorContext } from "@/lib/ColorContext";
import { useGlobalState } from "@/lib/GlobalState";
import { useOrientation } from "@/lib/useOrientation";
import * as Device from "expo-device";

export default function CustomStatusBar() {
  const {
    globalState: { isFullscreen },
  } = useGlobalState();
  const { colorSchemeKey } = useColorContext();
  const orientation = useOrientation();
  const isAlwaysHidden =
    orientation === "landscape" && !Device.modelName?.match("iPad");
  return (
    <StatusBar
      style={colorSchemeKey === "dark" ? "light" : "dark"}
      animated
      translucent={true}
      hidden={isFullscreen || isAlwaysHidden}
    />
  );
}
