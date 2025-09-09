# React Native Track Player MediaSession ID Fix

## Problem
The app was crashing with the following error on Android when closed and reopened:

```
java.lang.RuntimeException: Unable to create service com.doublesymmetry.trackplayer.service.MusicService: java.lang.IllegalStateException: Session ID must be unique. ID=
```

## Root Cause
The `react-native-track-player` library (v5.0.0-alpha0) was creating `MediaLibrarySession` instances without specifying a unique session ID, causing the framework to use an empty string `""` as the session ID. When the app was restarted, Android's MediaSession registry still had a reference to the previous session with the same empty ID, causing a collision.

## Solution
We've applied a patch using `patch-package` that:

1. **Generates unique session IDs** using timestamp and hashCode for both MusicService classes
2. **Prevents session ID collisions** during app lifecycle transitions
3. **Maintains compatibility** with the existing track player functionality

### Files Modified
- `com.doublesymmetry.trackplayer.service.MusicService.kt`
- `com.doublesymmetry.kotlinaudio.service.MusicService.kt`

### Changes Applied
```kotlin
// Added unique session ID generation
val uniqueSessionId = "TrackPlayer_${System.currentTimeMillis()}_${hashCode()}"

// Applied to MediaLibrarySession.Builder
mediaSession = MediaLibrarySession.Builder(this, fakePlayer, callback)
    .setId(uniqueSessionId)  // ← This fixes the issue
    .setBitmapLoader(...)
    .build()
```

## How It Works
The patch is automatically applied via `patch-package` during `npm install` through the `postinstall` script in `package.json`.

### To Manually Apply (if needed)
```bash
npx patch-package react-native-track-player
```

### To Regenerate the Patch (after making changes)
1. Modify the files in `node_modules/react-native-track-player/`
2. Run: `npx patch-package react-native-track-player`

## Testing
After applying this fix:
1. Clean and rebuild the Android project
2. Test the app lifecycle (close/reopen) multiple times
3. Verify audio playback functionality works correctly

The error should no longer occur during app restarts.
