import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useReducer,
  ReactNode,
} from "react";
// import AsyncStorage from "@react-native-async-storage/async-storage";
import { MMKV } from 'react-native-mmkv';
import * as Crypto from "expo-crypto";

// MMKV v3 has proper New Architecture support
const storage = new MMKV();

export interface Message {
  type: "postMessage" | "clearMessage" | "markMessage";
  content?: Record<string, any>;
  id?: string;
  mark?: boolean;
}

interface PersistedState {
  [key: string]: any;
}

interface GlobalStateContext {
  error: Error | undefined;
  persistedState: PersistedState;
  setPersistedState: (newState: Partial<PersistedState>) => boolean;
  globalState: Record<string, any>;
  setGlobalState: (newState: Record<string, any>) => void;
  pendingMessages: Message[];
  dispatch: React.Dispatch<Message>;
}


const GlobalState = React.createContext<GlobalStateContext | undefined>(
  undefined
);

export const useGlobalState = (): GlobalStateContext => {
  const context = useContext(GlobalState);
  if (!context) {
    throw new Error("useGlobalState must be used within a GlobalStateProvider");
  }
  return context;
};

const KEY = "globalState";

// Updated readStore using MMKV
const readStore = ({
  setPersistedStateInternal,
  setGlobalState,
  setError,
}: {
  setPersistedStateInternal: (state: PersistedState) => void;
  setGlobalState: (state: Record<string, any>) => void;
  setError: (error: Error) => void;
}) => {
  try {
    const storedStateString = storage.getString(KEY);
    const storedState = storedStateString ? JSON.parse(storedStateString) : {};
    setPersistedStateInternal(storedState);
  } catch (e) {
    console.error("readStore", e);
    setError(e instanceof Error ? e : new Error("Unknown error reading state"));
  }
  setGlobalState({ persistedStateReady: true });
};

// Updated writeStore using MMKV
const writeStore = ({
  persistedState,
  setError,
}: {
  persistedState: PersistedState;
  setError: (error: Error) => void;
}): boolean => {
  try {
    storage.set(KEY, JSON.stringify(persistedState));
    return true;
  } catch (e) {
    console.error("writeStore", e);
    setError(e instanceof Error ? e : new Error("Unknown error writing state"));
    return false;
  }
};

const messageReducer = (state: Message[], action: Message) => {
  switch (action.type) {
    case "postMessage":
      return state.concat({
        id: Crypto.randomUUID(),
        type: "postMessage",
        content: action.content,
      });
    case "clearMessage":
      return state.filter((msg) => msg.id !== action.id);
    case "markMessage":
      const message = state.find((msg) => msg.id === action.id);
      if (!message) {
        if (action.mark) {
          console.warn("message to mark not found");
        }
        return state;
      }
      return state.map((msg) =>
        msg.id === message.id
          ? {
              ...message,
              mark: action.mark,
            }
          : msg
      );
    default:
      throw new Error("Unknown action type");
  }
};

interface GlobalStateProviderProps {
  children: ReactNode;
}

export const GlobalStateProvider: React.FC<GlobalStateProviderProps> = ({
  children,
}) => {
  const [error, setError] = useState<Error | undefined>();
  const [persistedState, setPersistedStateInternal] = useState<PersistedState>({});
  
  const setPersistedState = useCallback(
    (newState: Partial<PersistedState>): boolean => {
      const updatedState = { ...persistedState, ...newState };
      setPersistedStateInternal(updatedState);
      console.log("previous state", persistedState);
      try {
        console.log("new persisted state", updatedState);
        const success = writeStore({
          persistedState: updatedState,
          setError,
        });
        return success;
      } catch (e) {
        console.error("State persistence failed in setPersistedState:", e);
        setError(e instanceof Error ? e : new Error("Unknown error during persistence"));
        return false;
      }
    },
    [persistedState, setError]
  );

  const [globalState, setGlobalStateRaw] = useState<Record<string, any>>({});
  const setGlobalState = useCallback(
    (newState: Record<string, any>) =>
      setGlobalStateRaw((state) => ({ ...state, ...newState })),
    []
  );

  const [pendingMessages, dispatch] = useReducer(messageReducer, []);

  useEffect(() => {
    readStore({
      setPersistedStateInternal,
      setGlobalState,
      setError,
    });
  }, [setGlobalState, setPersistedStateInternal]);

  const context: GlobalStateContext = {
    error,
    persistedState,
    setPersistedState,
    globalState,
    setGlobalState,
    pendingMessages,
    dispatch,
  };

  return (
    <GlobalState.Provider value={context}>{children}</GlobalState.Provider>
  );
};
