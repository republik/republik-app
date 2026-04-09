/**
 * ExpoAudioPlayer - Prototype implementation using expo-audio
 * This is a drop-in replacement for HeadlessAudioPlayer using expo-audio SDK 55
 */
import { AudioQueueItem } from "./types/AudioQueueItem";
import { AudioEvent } from "./AudioEvent";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAudioPlayer,
  AudioPlayer,
  AudioStatus,
  setAudioModeAsync,
} from "expo-audio";
import useWebViewEvent from "@/lib/useWebViewEvent";
import useInterval from "@/lib/useInterval";
import { useGlobalState } from "@/lib/GlobalState";
import { AppState, AppStateStatus, BackHandler, Platform } from "react-native";

type AudioObject = {
  item: AudioQueueItem;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  initialTime?: number;
};

const SYNC_INTERVAL_WHILE_PLAYING = 500;

function getAudioObjectFromQueueItem(
  item: AudioQueueItem,
  coverImage?: string
): AudioObject | null {
  const { meta } = item.document;
  const { title, audioSource, image } = meta ?? {};
  if (!audioSource) {
    return null;
  }
  return {
    item,
    url: audioSource.mp3,
    title: title || "Republik",
    artist: "Republik",
    artwork:
      coverImage || image || require("../../assets/images/playlist-logo.png"),
    duration: audioSource.durationMs / 1000,
  };
}

type UIState = {
  isVisible: boolean;
  isExpanded: boolean;
};

type AudioPlayerState = {
  itemId: string;
  playerState: string;
  duration: number;
  position: number;
  playbackRate: number;
  forceUpdate?: boolean;
};

const ExpoAudioPlayer = () => {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const { dispatch } = useGlobalState();
  const playerRef = useRef<AudioPlayer | null>(null);
  const [activeTrack, setActiveTrack] = useState<AudioObject | null>(null);
  const lazyInitializedTrack = useRef<AudioObject | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [uiState, setUIState] = useState<UIState>({
    isVisible: false,
    isExpanded: false,
  });

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });

    playerRef.current = createAudioPlayer(null, {
      updateInterval: SYNC_INTERVAL_WHILE_PLAYING,
    });

    return () => {
      playerRef.current?.remove();
    };
  }, []);

  const notifyStateSync = useCallback(
    (state: AudioPlayerState) =>
      dispatch({
        type: "postMessage",
        content: {
          type: AudioEvent.SYNC,
          payload: {
            itemId: state.itemId,
            playerState: state.playerState,
            duration: state.duration,
            currentTime: state.position,
            playbackRate: state.playbackRate,
            forceUpdate: state.forceUpdate,
          },
        },
      }),
    [dispatch]
  );

  const notifyQueueAdvance = useCallback(
    (itemId: string) =>
      dispatch({
        type: "postMessage",
        content: {
          type: AudioEvent.QUEUE_ADVANCE,
          payload: itemId,
        },
      }),
    [dispatch]
  );

  const notifyError = useCallback(
    (error: Error) => {
      dispatch({
        type: "postMessage",
        content: {
          type: AudioEvent.ERROR,
          payload: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        },
      });
    },
    [dispatch]
  );

  const notifyMinimize = useCallback(() => {
    dispatch({
      type: "postMessage",
      content: {
        type: AudioEvent.MINIMIZE_PLAYER,
        payload: null,
      },
    });
  }, [dispatch]);

  const resetCurrentTrack = useCallback(async () => {
    lazyInitializedTrack.current = null;
    setActiveTrack(null);
    playerRef.current?.clearLockScreenControls();
    playerRef.current?.pause();
  }, []);

  const handleError = useCallback(
    (error: Error) => {
      console.error(error);
      notifyError(error);
    },
    [notifyError]
  );

  const syncStateWithWebUI = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;

    if (isInitialized && activeTrack) {
      const status: AudioPlayerState = {
        itemId: activeTrack.item.id,
        playerState: player.playing
          ? "playing"
          : player.isBuffering
          ? "buffering"
          : player.isLoaded
          ? "paused"
          : "loading",
        duration: player.duration || 0,
        position: player.currentTime || 0,
        playbackRate: Math.round(player.playbackRate * 100) / 100,
      };
      notifyStateSync(status);
    } else if (lazyInitializedTrack.current) {
      notifyStateSync({
        itemId: lazyInitializedTrack.current.item.id,
        playerState: "idle",
        duration: 0,
        position: lazyInitializedTrack.current.initialTime ?? 0,
        playbackRate,
        forceUpdate: true,
      });
    }
  }, [notifyStateSync, isInitialized, activeTrack, playbackRate]);

  const handleQueueAdvance = useCallback(
    async (itemId: string) => {
      notifyQueueAdvance(itemId);
      syncStateWithWebUI();
    },
    [syncStateWithWebUI, notifyQueueAdvance]
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const statusListener = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
        setIsPlaying(status.playing);
        setIsBuffering(status.isBuffering);

        if (status.didJustFinish && activeTrack) {
          handleQueueAdvance(activeTrack.item.id);
          resetCurrentTrack();
        }
      }
    );

    return () => {
      statusListener.remove();
    };
  }, [activeTrack, handleQueueAdvance, resetCurrentTrack]);

  const handlePlay = useCallback(
    async (initialTime?: number) => {
      try {
        const player = playerRef.current;
        if (!player) return;

        if (!isInitialized) {
          setIsInitialized(true);
          if (lazyInitializedTrack.current) {
            const track = lazyInitializedTrack.current;
            setActiveTrack(track);

            player.replace({ uri: track.url });
            player.setActiveForLockScreen(
              true,
              {
                title: track.title,
                artist: track.artist,
                artworkUrl: typeof track.artwork === "string" ? track.artwork : undefined,
              },
              {
                showSeekForward: true,
                showSeekBackward: true,
              }
            );

            initialTime = track.initialTime;
          }
        }

        if (initialTime && initialTime > 0) {
          await player.seekTo(initialTime);
        }

        player.play();
        
        // Set playback rate after play() - must use setPlaybackRate method
        player.setPlaybackRate(playbackRate);

        if (Platform.OS === "ios") {
          // iOS sometimes needs the rate to be re-applied after playback starts
          setTimeout(() => {
            playerRef.current?.setPlaybackRate(playbackRate);
          }, 100);
        }

        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, isInitialized, playbackRate, handleError]
  );

  const handlePause = useCallback(async () => {
    try {
      playerRef.current?.pause();
      syncStateWithWebUI();
    } catch (error: any) {
      handleError(error);
    }
  }, [syncStateWithWebUI, handleError]);

  const handleStop = useCallback(async () => {
    try {
      setIsInitialized(false);
      playerRef.current?.pause();
      playerRef.current?.clearLockScreenControls();
      syncStateWithWebUI();
    } catch (error: any) {
      handleError(error);
    }
  }, [syncStateWithWebUI, handleError]);

  const handleSeek = useCallback(
    async (payload: number) => {
      try {
        if (isInitialized) {
          await playerRef.current?.seekTo(payload);
        } else if (lazyInitializedTrack.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: payload,
          };
        }
        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, isInitialized, handleError]
  );

  const handleForward = useCallback(
    async (payload: number) => {
      try {
        const player = playerRef.current;
        if (isInitialized && player) {
          await player.seekTo(player.currentTime + payload);
        } else if (lazyInitializedTrack.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: Math.max(
              (lazyInitializedTrack.current.initialTime || 0) + payload,
              0
            ),
          };
        }
        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, isInitialized, handleError]
  );

  const handleBackward = useCallback(
    async (payload: number) => {
      try {
        const player = playerRef.current;
        if (isInitialized && player) {
          await player.seekTo(Math.max(player.currentTime - payload, 0));
        } else if (lazyInitializedTrack.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: Math.max(
              (lazyInitializedTrack.current.initialTime || 0) - payload,
              0
            ),
          };
        }
        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, isInitialized, handleError]
  );

  const handlePlaybackRate = useCallback(
    async (payload: number) => {
      try {
        setPlaybackRate(payload);
        playerRef.current?.setPlaybackRate(payload);
        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, handleError]
  );

  useInterval(
    () => syncStateWithWebUI(),
    isPlaying || isBuffering ? SYNC_INTERVAL_WHILE_PLAYING : null
  );

  useWebViewEvent<number | undefined>(AudioEvent.PLAY, handlePlay);
  useWebViewEvent<void>(AudioEvent.PAUSE, handlePause);
  useWebViewEvent<void>(AudioEvent.STOP, handleStop);
  useWebViewEvent<number>(AudioEvent.SEEK, handleSeek);
  useWebViewEvent<number>(AudioEvent.FORWARD, handleForward);
  useWebViewEvent<number>(AudioEvent.BACKWARD, handleBackward);
  useWebViewEvent<number>(AudioEvent.PLAYBACK_RATE, handlePlaybackRate);

  type AudioSetupData = {
    item: AudioQueueItem;
    autoPlay?: boolean;
    initialTime?: number;
    playbackRate?: number;
    coverImage?: string;
  };

  useWebViewEvent<AudioSetupData>(
    AudioEvent.SETUP_TRACK,
    async ({
      item,
      autoPlay,
      initialTime,
      playbackRate: newPlaybackRate,
      coverImage,
    }: AudioSetupData) => {
      try {
        const audioObject = getAudioObjectFromQueueItem(item, coverImage);
        if (!audioObject) {
          console.warn("No audio source found for item", item.id);
          return;
        }

        audioObject.initialTime = initialTime || 0;

        if (newPlaybackRate) {
          setPlaybackRate(newPlaybackRate);
        }

        if (!isInitialized) {
          lazyInitializedTrack.current = audioObject;
          return;
        }

        setActiveTrack(audioObject);
        const player = playerRef.current;
        if (player) {
          player.replace({ uri: audioObject.url });
          player.setActiveForLockScreen(
            true,
            {
              title: audioObject.title,
              artist: audioObject.artist,
              artworkUrl:
                typeof audioObject.artwork === "string"
                  ? audioObject.artwork
                  : undefined,
            },
            {
              showSeekForward: true,
              showSeekBackward: true,
            }
          );
        }

        syncStateWithWebUI();
        if (autoPlay) {
          await handlePlay(initialTime);
        } else if (initialTime && player) {
          await player.seekTo(initialTime);
        }
      } catch (error: any) {
        handleError(error);
      }
    }
  );

  useWebViewEvent<UIState>(AudioEvent.UPDATE_UI_STATE, (newUIState: UIState) =>
    setUIState(newUIState)
  );

  useEffect(() => {
    if (Platform.OS === "android") {
      const handleBackPress = () => {
        if (uiState.isExpanded) {
          notifyMinimize();
          return true;
        }
        return false;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress
      );
      return () => backHandler.remove();
    }
  }, [uiState, notifyMinimize]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        syncStateWithWebUI();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [syncStateWithWebUI]);

  return null;
};

export default ExpoAudioPlayer;
