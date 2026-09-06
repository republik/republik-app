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
// A "did just finish" event is only trusted if playback actually got close to
// the end of the track. On a flaky connection both platforms report a finished
// track when the stream is cut short (ExoPlayer treats the truncated response
// as EOF, AVPlayer posts AVPlayerItemDidPlayToEndTime), which would otherwise
// make the web-ui skip the item and drop it from the queue.
const PLAYBACK_ENDED_OFFSET = 3;

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
  const lazyInitializedTrack = useRef<AudioObject | null>(null);
  const activeTrackRef = useRef<AudioObject | null>(null);
  const isInitializedRef = useRef(false);
  const playbackRateRef = useRef(1);
  // Last position reported while playing. Used to tell a real end of playback
  // from an aborted stream, since the position reported alongside the finish
  // event is unreliable (iOS reports the full track duration).
  const lastPositionRef = useRef(0);
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

  const saveProgressToWeb = useCallback(
    (track: AudioObject | null, position?: number) => {
      const player = playerRef.current;
      const mediaId = track?.item.document.meta?.audioSource?.mediaId;
      const currentTime = position ?? player?.currentTime ?? 0;
      if (player && mediaId && currentTime > 0) {
        dispatch({
          type: "postMessage",
          content: {
            type: "onAppMediaProgressUpdate",
            currentTime,
            mediaId,
          },
        });
      }
    },
    [dispatch]
  );

  const resetCurrentTrack = useCallback(async () => {
    saveProgressToWeb(activeTrackRef.current);
    lazyInitializedTrack.current = null;
    activeTrackRef.current = null;
    lastPositionRef.current = 0;
    playerRef.current?.clearLockScreenControls();
    playerRef.current?.pause();
  }, [saveProgressToWeb]);

  const handleError = useCallback(
    (error: Error) => {
      console.error(error);
      notifyError(error);
    },
    [notifyError]
  );

  const applyPlaybackRate = useCallback((player: AudioPlayer) => {
    player.setPlaybackRate(playbackRateRef.current);
  }, []);

  const syncStateWithWebUI = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;

    const track = activeTrackRef.current ?? lazyInitializedTrack.current;
    const rate = playbackRateRef.current;

    if (isInitializedRef.current && track) {
      if (Math.abs(player.playbackRate - rate) > 0.01) {
        player.setPlaybackRate(rate);
      }

      notifyStateSync({
        itemId: track.item.id,
        playerState: player.playing
          ? "playing"
          : player.isBuffering
          ? "buffering"
          : player.isLoaded
          ? "paused"
          : "loading",
        duration: player.duration || 0,
        position: player.currentTime || 0,
        playbackRate: rate,
      });
    } else if (lazyInitializedTrack.current) {
      notifyStateSync({
        itemId: lazyInitializedTrack.current.item.id,
        playerState: "idle",
        duration: 0,
        position: lazyInitializedTrack.current.initialTime ?? 0,
        playbackRate: rate,
        forceUpdate: true,
      });
    }
  }, [notifyStateSync]);

  const handleQueueAdvance = useCallback(
    async (itemId: string) => {
      notifyQueueAdvance(itemId);
      syncStateWithWebUI();
    },
    [syncStateWithWebUI, notifyQueueAdvance]
  );

  /**
   * Whether a "did just finish" event really means the track played to its end.
   * The position of the finish event itself is not usable (iOS reports the full
   * duration even for a stream that was cut short), so the last position seen
   * while playing is compared against the duration instead.
   */
  const isPlaybackComplete = useCallback(
    (status: AudioStatus, track: AudioObject) => {
      const duration =
        status.duration > 0 ? status.duration : track.duration || 0;
      if (!duration || !isFinite(duration)) {
        // Without a duration there is nothing to check against, so keep the
        // player's own verdict.
        return true;
      }
      return lastPositionRef.current >= duration - PLAYBACK_ENDED_OFFSET;
    },
    []
  );

  /**
   * Playback stopped before the end of the track, most likely because the
   * stream broke down. Stay on the track and rewind the player to the last
   * position that actually played, so playback can be resumed there. The item
   * is deliberately not advanced, which would drop it from the web-ui queue.
   */
  const handleAbortedPlayback = useCallback(
    async (track: AudioObject) => {
      const player = playerRef.current;
      const position = lastPositionRef.current;
      console.warn("playback aborted before end of track", {
        itemId: track.item.id,
        position,
        duration: track.duration,
      });
      try {
        player?.pause();
        saveProgressToWeb(track, position);
        if (position > 0) {
          await player?.seekTo(position);
        }
      } catch (error) {
        console.warn("could not restore position after aborted playback", error);
      }
      syncStateWithWebUI();
    },
    [saveProgressToWeb, syncStateWithWebUI]
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const statusListener = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
        setIsPlaying(status.playing);
        setIsBuffering(status.isBuffering);

        const track = activeTrackRef.current;

        if (status.didJustFinish && track) {
          if (isPlaybackComplete(status, track)) {
            handleQueueAdvance(track.item.id);
            resetCurrentTrack();
          } else {
            handleAbortedPlayback(track);
          }
          return;
        }

        if (status.currentTime > 0) {
          lastPositionRef.current = status.currentTime;
        }
      }
    );

    return () => {
      statusListener.remove();
    };
  }, [
    handleQueueAdvance,
    resetCurrentTrack,
    isPlaybackComplete,
    handleAbortedPlayback,
  ]);

  const handlePlay = useCallback(
    async (initialTime?: number) => {
      try {
        const player = playerRef.current;
        if (!player) return;

        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
          if (lazyInitializedTrack.current) {
            const track = lazyInitializedTrack.current;
            activeTrackRef.current = track;

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
          lastPositionRef.current = initialTime;
        }

        player.play();
        applyPlaybackRate(player);

        if (Platform.OS === "ios") {
          // iOS sometimes needs the rate to be re-applied after playback starts
          setTimeout(() => {
            const currentPlayer = playerRef.current;
            if (currentPlayer) {
              applyPlaybackRate(currentPlayer);
            }
          }, 100);
        }

        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, applyPlaybackRate, handleError]
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
      saveProgressToWeb(activeTrackRef.current);
      isInitializedRef.current = false;
      playerRef.current?.pause();
      playerRef.current?.clearLockScreenControls();
      syncStateWithWebUI();
    } catch (error: any) {
      handleError(error);
    }
  }, [saveProgressToWeb, syncStateWithWebUI, handleError]);

  const handleSeek = useCallback(
    async (payload: number) => {
      try {
        if (isInitializedRef.current) {
          await playerRef.current?.seekTo(payload);
          lastPositionRef.current = payload;
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
    [syncStateWithWebUI, handleError]
  );

  const handleForward = useCallback(
    async (payload: number) => {
      try {
        const player = playerRef.current;
        if (isInitializedRef.current && player) {
          const position = player.currentTime + payload;
          await player.seekTo(position);
          lastPositionRef.current = position;
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
    [syncStateWithWebUI, handleError]
  );

  const handleBackward = useCallback(
    async (payload: number) => {
      try {
        const player = playerRef.current;
        if (isInitializedRef.current && player) {
          const position = Math.max(player.currentTime - payload, 0);
          await player.seekTo(position);
          lastPositionRef.current = position;
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
    [syncStateWithWebUI, handleError]
  );

  const handlePlaybackRate = useCallback(
    async (payload: number) => {
      try {
        playbackRateRef.current = payload;
        const player = playerRef.current;
        if (player) {
          applyPlaybackRate(player);
        }
        syncStateWithWebUI();
      } catch (error: any) {
        handleError(error);
      }
    },
    [syncStateWithWebUI, applyPlaybackRate, handleError]
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
        lastPositionRef.current = audioObject.initialTime;

        if (newPlaybackRate !== undefined && newPlaybackRate > 0) {
          playbackRateRef.current = newPlaybackRate;
        }

        if (!isInitializedRef.current) {
          lazyInitializedTrack.current = audioObject;
          return;
        }

        activeTrackRef.current = audioObject;
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
