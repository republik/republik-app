import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useReducer,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";


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
  setPersistedState: (newState: Partial<PersistedState>) => void;
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

const readStore = async ({
  setPersistedState,
  setGlobalState,
  setError,
}: {
  setPersistedState: (state: PersistedState) => void;
  setGlobalState: (state: Record<string, any>) => void;
  setError: (error: Error) => void;
}) => {
  try {
    const storedState = JSON.parse((await AsyncStorage.getItem(KEY)) || "{}");
    setPersistedState(storedState);
  } catch (e) {
    console.error("readStore", e);
    setError(e instanceof Error ? e : new Error("Unknown error occurred"));
  }
  setGlobalState({ persistedStateReady: true });
};

const writeStore = async ({
  persistedState,
  setError,
}: {
  persistedState: PersistedState;
  setError: (error: Error) => void;
}) => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(persistedState));
  } catch (e) {
    console.error(e);
    setError(e instanceof Error ? e : new Error("Unknown error occurred"));
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

  const [persistedState, setPersistedStateRaw] = useState<PersistedState>({});
  const setPersistedState = useCallback(
    (newState: Partial<PersistedState>) =>
      setPersistedStateRaw((state) => ({ ...state, ...newState })),
    []
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
      setPersistedState,
      setGlobalState,
      setError,
    });
  }, [setGlobalState, setPersistedState]);

  useEffect(() => {
    writeStore({
      persistedState,
      setError,
    });
  }, [persistedState]);

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
