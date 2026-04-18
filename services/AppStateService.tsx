import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useGlobalState } from "@/lib/GlobalState";

const AppStateService = () => {
  const {
    globalState: { appState },
    setGlobalState,
    setPersistedState,
    dispatch,
  } = useGlobalState();

  const previousAppState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        previousAppState.current === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        // Passing {} changes no data, but forces a synchronous re-write of
        // the current in-memory state to MMKV. This is a last-chance flush
        // before the OS suspends (or potentially kills) the process.
        console.log("[Persist] background flush");
        setPersistedState({});
      }
      previousAppState.current = nextAppState;
      setGlobalState({ appState: nextAppState });
    });

    return () => {
      subscription.remove();
    };
  }, [setGlobalState, setPersistedState]);
  
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
