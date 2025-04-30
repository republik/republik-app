import { useState, useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

// map orientation enum to "portrait" or "landscape"
const mapOrientation = (
  orientation: ScreenOrientation.Orientation
): "portrait" | "landscape" => {
  switch (orientation) {
    case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
    case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
      return "landscape";
    default:
      return "portrait";
  }
};

export const useOrientation = () => {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "portrait"
  );

  // Since the new audio player isn't optimized for landscape,
  // we currently don't support unlocking the screen orientation
  // TODO: unlock the screen orientation when the audio player is optimized for landscape
  // TODO: remove "orientation": "portrait", from app.json
  // useEffect(() => {
  //   const unlockScreenOerientation = async () => {
  //     await ScreenOrientation.unlockAsync()
  //   }
  //   unlockScreenOerientation()
  // }, [])

  useEffect(() => {
    const getInitialOrientation = async () => {
      try {
        const initialOrientation =
          await ScreenOrientation.getOrientationAsync();
        setOrientation(mapOrientation(initialOrientation));
      } catch (e) {
        console.error("Failed to get initial screen orientation:", e);
      }
    };

    getInitialOrientation();

    const handleOrientationChange = (
      event: ScreenOrientation.OrientationChangeEvent
    ) => {
      setOrientation(mapOrientation(event.orientationInfo.orientation));
    };

    const subscription = ScreenOrientation.addOrientationChangeListener(
      handleOrientationChange
    );

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  return orientation;
};
