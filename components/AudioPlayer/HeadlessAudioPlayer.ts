import { AudioQueueItem } from "./types/AudioQueueItem";
import { AudioEvent } from "./AudioEvent";
import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from 'expo-av';
import useWebViewEvent from "@/lib/useWebViewEvent";
import useInterval from "@/lib/useInterval";
import useWebViewHandlers from "./hooks/useWebViewHandlers";
import { AppState, AppStateStatus, BackHandler, Platform } from "react-native";

// Define audio player states to match TrackPlayer's states
enum State {
  None = "none",
  Ready = "ready",
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
  Buffering = "buffering",
  Loading = "loading"
}

type AudioObject = {
  item: AudioQueueItem;
  sound: Audio.Sound | null;
  uri: string;
  initialTime?: number;
};

// Interval in ms to sync audio player state with web-ui.
const SYNC_INTERVAL_WHILE_PLAYING = 500;
const SYNC_INTERVAL_WHILE_CONNECTING = 1000;

/**
 * HeadlessAudioPlayer is a wrapper around expo-av Audio without any react-native UI.
 * The player is controlled through events received from the webview.
 */
const HeadlessAudioPlayer = ({}) => {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [playerState, setPlayerState] = useState<State>(State.None);
  const [uiState, setUIState] = useState<{
    isVisible: boolean;
    isExpanded: boolean;
  }>({
    isVisible: false,
    isExpanded: false,
  });

  const [activeTrack, setActiveTrack] = useState<AudioObject | null>(null);
  const lazyInitializedTrack = useRef<AudioObject | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const playbackObject = useRef<Audio.Sound | null>(null);

  const { notifyStateSync, notifyQueueAdvance, notifyError, notifyMinimize } =
    useWebViewHandlers();

  const getCurrentProgress = async () => {
    if (!playbackObject.current) {
      return { position: currentPosition, duration };
    }
    
    try {
      const status = await playbackObject.current.getStatusAsync();
      if (status.isLoaded) {
        return {
          position: status.positionMillis / 1000, // convert to seconds to match TrackPlayer
          duration: status.durationMillis ? status.durationMillis / 1000 : 0,
        };
      }
    } catch (error) {
      console.error("Error getting current progress", error);
    }
    
    return { position: currentPosition, duration };
  };

  const syncStateWithWebUI = useCallback(async () => {
    const { position, duration } = await getCurrentProgress();
    setCurrentPosition(position);
    setDuration(duration);

    if (isInitialized && activeTrack) {
      notifyStateSync({
        itemId: activeTrack.item.id,
        playerState: playerState,
        duration: duration,
        position: position,
        playbackRate: playbackRate,
      });
    } else if (lazyInitializedTrack?.current) {
      notifyStateSync({
        itemId: lazyInitializedTrack.current.item.id,
        playerState: State.None,
        duration: 0,
        position: lazyInitializedTrack.current.initialTime ?? 0,
        playbackRate,
        forceUpdate: true,
      });
    }
  }, [notifyStateSync, isInitialized, playerState, playbackRate, activeTrack]);

  const resetCurrentTrack = async () => {
    if (playbackObject.current) {
      await playbackObject.current.unloadAsync();
      playbackObject.current = null;
    }
    lazyInitializedTrack.current = null;
    setActiveTrack(null);
    setPlayerState(State.None);
  };

  const handleError = useCallback(
    (error: Error) => {
      console.error(error);
      notifyError(error);
    },
    [notifyError]
  );

  const handleQueueAdvance = useCallback(
    async (itemId: string) => {
      notifyQueueAdvance(itemId);
      await resetCurrentTrack();
    },
    [notifyQueueAdvance]
  );

  // Monitor sound playback completion
  useEffect(() => {
    if (playbackObject.current) {
      const onPlaybackStatusUpdate = (status: any) => {
        if (status.isLoaded) {
          // Update duration if it changed
          if (status.durationMillis && status.durationMillis / 1000 !== duration) {
            setDuration(status.durationMillis / 1000);
          }
          
          // Update position
          setCurrentPosition(status.positionMillis / 1000);
          
          // Update player state
          if (status.isPlaying) {
            setPlayerState(State.Playing);
          } else if (status.isBuffering) {
            setPlayerState(State.Buffering);
          } else {
            setPlayerState(State.Paused);
          }
          
          // Handle playback completion
          if (status.didJustFinish && !status.isLooping) {
            handleQueueAdvance(activeTrack?.item.id || '');
          }

          // Always sync with webview when status changes
          syncStateWithWebUI();
        }
      };

      playbackObject.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      
      return () => {
        if (playbackObject.current) {
          playbackObject.current.setOnPlaybackStatusUpdate(null);
        }
      };
    }
  }, [playbackObject.current, duration, handleQueueAdvance, activeTrack, syncStateWithWebUI]);

  const handlePlay = useCallback(
    async (initialTime?: number) => {
      try {
        if (!isInitialized) {
          setIsInitialized(true);
          if (
            lazyInitializedTrack?.current &&
            lazyInitializedTrack.current !== null
          ) {
            setActiveTrack(lazyInitializedTrack.current);
            
            // Load the sound
            const { sound } = await Audio.Sound.createAsync(
              { uri: lazyInitializedTrack.current.uri },
              { shouldPlay: false, positionMillis: initialTime ? initialTime * 1000 : 0 }
            );
            
            playbackObject.current = sound;
            initialTime = lazyInitializedTrack.current.initialTime;
          }
        }

        if (playbackObject.current) {
          // Wait for sound to be loaded
          let status = await playbackObject.current.getStatusAsync();
          while (!status.isLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
            status = await playbackObject.current.getStatusAsync();
          }

          if (initialTime !== undefined) {
            await playbackObject.current.setPositionAsync(initialTime * 1000);
            setCurrentPosition(initialTime);
          }
          
          // Set rate before playing
          await playbackObject.current.setRateAsync(playbackRate, true);
          await playbackObject.current.playAsync();
          
          setPlayerState(State.Playing);
        }
      } catch (error: any) {
        handleError(error);
      }
    },
    [isInitialized, playbackRate, handleError]
  );

  const handlePause = useCallback(async () => {
    try {
      if (playbackObject.current) {
        await playbackObject.current.pauseAsync();
        setPlayerState(State.Paused);
      }
    } catch (error: any) {
      handleError(error);
    }
  }, [handleError]);

  const handleStop = useCallback(async () => {
    try {
      setIsInitialized(false);
      if (playbackObject.current) {
        await playbackObject.current.stopAsync();
        await playbackObject.current.unloadAsync();
        playbackObject.current = null;
      }
      setPlayerState(State.Stopped);
    } catch (error: any) {
      handleError(error);
    }
  }, [handleError]);

  const handleSeek = useCallback(
    async (payload: any) => {
      try {
        if (isInitialized && playbackObject.current) {
          await playbackObject.current.setPositionAsync(payload * 1000);
          setCurrentPosition(payload);
        } else if (lazyInitializedTrack?.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: payload,
          };
        }
      } catch (error: any) {
        handleError(error);
      }
    },
    [isInitialized, handleError]
  );

  const handleForward = useCallback(
    async (payload: number) => {
      try {
        if (isInitialized && playbackObject.current) {
          const newPosition = currentPosition + payload;
          await playbackObject.current.setPositionAsync(newPosition * 1000);
          setCurrentPosition(newPosition);
        } else if (lazyInitializedTrack?.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: Math.max(
              (lazyInitializedTrack?.current.initialTime || 0) + payload,
              0
            ),
          };
        }
      } catch (error: any) {
        handleError(error);
      }
    },
    [currentPosition, isInitialized, handleError]
  );

  const handleBackward = useCallback(
    async (payload: number) => {
      try {
        if (isInitialized && playbackObject.current) {
          const newPosition = Math.max(currentPosition - payload, 0);
          await playbackObject.current.setPositionAsync(newPosition * 1000);
          setCurrentPosition(newPosition);
        } else if (lazyInitializedTrack?.current) {
          lazyInitializedTrack.current = {
            ...lazyInitializedTrack.current,
            initialTime: Math.max(
              (lazyInitializedTrack?.current.initialTime || 0) - payload,
              0
            ),
          };
        }
      } catch (error: any) {
        handleError(error);
      }
    },
    [currentPosition, isInitialized, handleError]
  );

  const handlePlaybackRate = useCallback(
    async (payload: number) => {
      try {
        setPlaybackRate(payload);
        if (playbackObject.current) {
          await playbackObject.current.setRateAsync(payload, true);
        }
      } catch (error: any) {
        handleError(error);
      }
    },
    [handleError]
  );

  // Handle events from web-ui
  useWebViewEvent<number | undefined>(AudioEvent.PLAY, handlePlay);
  useWebViewEvent<void>(AudioEvent.PAUSE, handlePause);
  useWebViewEvent<void>(AudioEvent.STOP, handleStop);
  useWebViewEvent<void>(AudioEvent.SEEK, handleSeek);
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
      playbackRate,
      coverImage,
    }: AudioSetupData) => {
      try {
        // Get the mp3 URL from the item
        const mp3Url = item.document.meta?.audioSource?.mp3;
        
        if (!mp3Url) {
          console.warn("no audio source found for item", item);
          return;
        }

        const nextItem = {
          item,
          sound: null,
          uri: mp3Url,
          initialTime: initialTime || 0,
        };

        if (playbackRate) {
          setPlaybackRate(playbackRate);
        }

        // During the initial setup, the player saves the track into a ref
        if (!isInitialized) {
          lazyInitializedTrack.current = nextItem;
          return;
        }
        
        // Stop current playback if any
        if (playbackObject.current) {
          await playbackObject.current.unloadAsync();
        }
        
        setPlayerState(State.Loading);
        setActiveTrack(nextItem);
        
        // Load new sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: mp3Url },
          { shouldPlay: false, positionMillis: initialTime ? initialTime * 1000 : 0 }
        );
        
        playbackObject.current = sound;
        setPlayerState(State.Ready);
        
        // Get duration
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setDuration(status.durationMillis / 1000);
        }

        if (autoPlay) {
          await handlePlay(initialTime);
        } else if (initialTime) {
          setCurrentPosition(initialTime);
        }
        
        return Promise.resolve();
      } catch (error: any) {
        handleError(error);
      }
    }
  );

  // Sync the UI-state of the web-player to allow for special handling of back button in android
  useWebViewEvent<{ isVisible: boolean; isExpanded: boolean }>(
    AudioEvent.UPDATE_UI_STATE,
    (newUIState) => setUIState(newUIState)
  );

  // On android the back button should cause the expanded player to minimize on back button press
  useEffect(() => {
    if (Platform.OS === "android") {
      const handleBackPress = () => {
        if (uiState.isExpanded) {
          notifyMinimize();
          return true; // The event is considered as handled
        }
        return false; // Event is bubbled up for the OS to handle
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress
      );
      return () => backHandler.remove();
    }
  }, [uiState, notifyMinimize]);

  // Sync the player state with the webview when the app comes to the foreground
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

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      if (playbackObject.current) {
        playbackObject.current.unloadAsync();
      }
    };
  }, []);

  return null;
};

export default HeadlessAudioPlayer;
