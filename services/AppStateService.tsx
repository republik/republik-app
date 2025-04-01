import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useGlobalState } from "@/lib/GlobalState";

const AppStateService = () => {
  const {
    globalState: { appState },
    setGlobalState,
    dispatch,
    persistedState,
    setPersistedState
  } = useGlobalState();
  
  const previousAppState = useRef<AppStateStatus | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // Ensure we persist state when app is going to background or inactive
      if (
        previousAppState.current === "active" && 
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        console.log("App going to background, forcing state persistence");
        // Force an immediate write with no changes to ensure latest state is persisted
        setPersistedState({}).then(success => {
          if (success) {
            console.log("Successfully persisted state before app background");
          } else {
            console.error("Failed to persist state before app background");
          }
        });
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
