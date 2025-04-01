import { Audio } from 'expo-av';

/**
 * Setup the AudioPlayer with all the necessary configuration.
 * @returns boolean saying if the AudioPlayer is ready to be used
 */
const SetupAudioPlayerService = async () => {
  try {
    // Set audio mode for the entire app
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    
    return true;
  } catch (error) {
    console.error('Error setting up audio player:', error);
    return false;
  }
};

export default SetupAudioPlayerService;
