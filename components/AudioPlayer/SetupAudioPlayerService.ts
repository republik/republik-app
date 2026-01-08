import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  RepeatMode,
} from 'react-native-track-player'
import * as Sentry from '@sentry/react-native'

/**
 * Setup the AudioPlayer with all the necessary configuration.
 * @returns boolean saying if the AudioPlayer is ready to be used
 */
const SetupAudioPlayerService = async () => {
  let isSetup = false
  try {
    await TrackPlayer.getActiveTrackIndex()
    isSetup = true
  } catch (err) {
    try {
      await TrackPlayer.setupPlayer({
        backBuffer: 30,
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.SpokenAudio,
      })
      await TrackPlayer.updateOptions({
        forwardJumpInterval: 30,
        backwardJumpInterval: 10,
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.JumpForward,
          Capability.JumpBackward,
          Capability.SeekTo,
        ],
        android: {
          appKilledPlaybackBehavior:
            AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
      })
      await TrackPlayer.setRepeatMode(RepeatMode.Off)
      isSetup = true
    } catch (setupError) {
      // Handle ForegroundServiceStartNotAllowedException on Android 12+
      // This happens when the app tries to start the audio service from the background
      Sentry.captureException(setupError, {
        tags: { component: 'AudioPlayer', operation: 'setupPlayer' },
      })
      console.warn('Failed to setup audio player:', setupError)
      isSetup = false
    }
  }
  return isSetup
}

export default SetupAudioPlayerService
