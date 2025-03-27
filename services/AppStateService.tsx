import { useEffect } from "react";
import { AppState } from "react-native";

import { useGlobalState } from "@/lib/GlobalState";

const AppStateService = () => {
  const {
    globalState: { appState },
    setGlobalState,
    dispatch,
  } = useGlobalState();

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      setGlobalState({ appState: nextAppState });
    });
    return () => {
      subscription.remove();
    };
  }, [setGlobalState]);
  useEffect(() => {
    if (!appState) {
      return;
    }
    dispatch({
      type: "postMessage",
      content: {
        type: "appState",
        current: appState,
      },
    });
  }, [appState, dispatch]);

  return null;
};

export default AppStateService;
