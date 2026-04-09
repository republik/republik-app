# Republik App

A React Native mobile application that provides a native wrapper for the [Republik.ch](https://www.republik.ch) website with enhanced audio playback capabilities.

## Overview

The Republik App is built with Expo SDK 55 and React Native 0.83, serving as a WebView wrapper for the Republik.ch website. The app enables browsing of Republik content while providing native mobile features like background audio playback, push notifications, and deep linking.

### Key Features

- **WebView Integration**: Renders the complete Republik.ch website
- **Background Audio Player**: Native audio controls using `expo-audio` for articles with audio content
- **Bidirectional Communication**: PostMessage API integration between the native app and web content
- **Deep Linking**: Support for `republik.ch` and `www.republik.ch` URLs
- **Push Notifications**: Native notification support

## Architecture

### Core Components

- **WebView Container** (`components/Web.tsx`): Main component that renders the Republik website and handles communication
- **Audio Player** (`components/AudioPlayer/ExpoAudioPlayer.tsx`): React component-based audio player using `expo-audio` with native lock screen controls
- **Global State Management** (`lib/GlobalState.tsx`): Centralized state management for app-wide data
- **Services**: Background services for deep linking, push notifications, and app state

### Communication Flow

The app uses a PostMessage API to communicate between the native React Native layer and the web content:

```typescript
// Native → Web: Sending messages to the webview
dispatch({
  type: "postMessage",
  content: {
    type: "push-route",
    url: "/article/123"
  }
});

// Web → Native: Receiving messages from webview
const onMessage = (e: WebViewMessageEvent) => {
  const message = JSON.parse(e.nativeEvent.data);
  switch (message.type) {
    case "play-audio":
      // Handle audio playback
      break;
    case "share":
      // Handle native sharing
      break;
    // ... other message types
  }
};
```

## Development Setup

### Prerequisites

- Node.js ≥ 18 (LTS version recommended)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator, requires Xcode 16+ and Android Studio

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
# or
npx expo start
```

### Running on Devices

#### iOS Simulator
```bash
npm run ios
# or
npx expo run:ios
```

#### Android Emulator
```bash
npm run android
# or
npx expo run:android
```

#### Physical Device (Development Builds)

For testing on physical devices, a development build needs to be created.

**Prerequisites:**
- EAS CLI installed: `npm install -g @expo/eas-cli`
- Expo account (sign up at [expo.dev](https://expo.dev))
- EAS CLI logged in: `eas login`

**Create development builds:**

For iOS:
```bash
eas build --profile development --platform ios
```

For Android:
```bash
eas build --profile development --platform android
```

The builds will be available in your [Expo dashboard](https://expo.dev) for download and installation.

## Audio Player Implementation

As of Expo SDK 55, the app uses `expo-audio` (the first-party Expo audio library) replacing the previous `react-native-track-player` integration. The audio player is now a React component (`ExpoAudioPlayer`) rather than a headless service, which removes the need for a separate playback service registration and eliminates the patched git dependency on `react-native-track-player`.

### Architecture

The player is rendered as a headless React component (`<ExpoAudioPlayer />`) mounted in the app root alongside the WebView. It uses the `expo-audio` `createAudioPlayer` API and communicates with the web layer entirely through the PostMessage bridge.

**Lazy initialization**: the track is set up via a `SETUP_TRACK` event before the user hits play. The player is actually initialized (and the audio session started) only when `PLAY` is received, reducing unnecessary resource usage.

### Audio Features

- Background audio playback (enabled via `setAudioModeAsync` with `shouldPlayInBackground: true`)
- Native lock screen controls (set via `player.setActiveForLockScreen`)
- Playback speed control
- Forward / backward seek
- Progress synchronization with the web UI at 500 ms intervals while playing
- Android hardware back button collapses the expanded player UI
- Automatic state sync when the app returns to foreground

## URL Persistence

The app persists the WebView's current URL to MMKV storage so users return to their last-viewed page on next launch. Three complementary strategies ensure the URL is saved reliably:

### 1. Navigation events (`routeChange`)

Every time the user navigates within the WebView, the web frontend sends a `routeChange` postMessage with the new URL. On iOS, the native `onNavigationStateChange` callback also fires for `pushState` navigation. Both paths persist the URL to MMKV immediately. This is the primary mechanism and covers the vast majority of navigations.

**Platform note:** On Android, `onNavigationStateChange` does not fire for `history.pushState()` calls. The app relies entirely on the web frontend's `routeChange` messages for SPA navigation on Android.

### 2. Periodic sync (`urlSync`)

A 10-second interval injects JavaScript into the WebView to read `window.location.href` and post it back as a `urlSync` message. If the URL differs from what is currently in MMKV, it is persisted. This is a safety net: if a `routeChange` message was dropped or delayed, the persisted URL is at most ~10 seconds stale. The `urlSync` message type is intentionally separate from `routeChange` -- it does not update the in-session navigation history or trigger any side effects beyond the MMKV write.

**Platform note:** This only runs while the app is in the foreground. When backgrounded, the OS suspends WebView JavaScript execution and the interval stops firing.

### 3. Background transition flush

When the app transitions from active to background or inactive, `AppStateService` calls `setPersistedState({})`. This does not change any data -- it forces a synchronous re-write of the current in-memory state to MMKV as a last-chance flush before the OS suspends or kills the process.

**Platform note:** On iOS, a `SIGKILL` from the OS (e.g. memory pressure) gives no lifecycle event at all -- the process is terminated instantly. This flush only helps when the standard `active -> background` transition occurs. The periodic sync (strategy 2) mitigates the `SIGKILL` scenario by keeping MMKV reasonably up to date while the app is active.

## Deployment with EAS Build

The app uses Expo Application Services (EAS) for building and deploying to app stores.

### Build Profiles

The app has three build profiles configured in `eas.json`:

- **Development**: Development client builds for testing
- **Preview**: Internal distribution builds for testing
- **Production**: App store ready builds with auto-increment

### EAS Setup

1. Install EAS CLI:
```bash
npm install -g @expo/eas-cli
```

2. Login to your Expo account:
```bash
eas login
```

### Building

#### Development Build
```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

#### Preview Build
```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

#### Production Build
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

### Submission to App Stores

#### iOS App Store
```bash
eas submit --platform ios --profile production
```

#### Google Play Store
```bash
eas submit --platform android --profile production
```

#### APK File

Download «Distribution APK» file from Google Play Console and upload to our [S3 Bucket](https://s3.console.aws.amazon.com/s3/buckets/republik-assets?prefix=assets%2Fapp%2F&region=eu-central-1#).

Make sure to update the [APK download-link](https://republik.ch/app/apk/latest), so that the link points to the newly uploaded APK-file.
You can update the redirect-link by running the following GraphQL mutation on api.republik.ch:

```graphql
  mutation {
    updateRedirection(
      id:"7e9c49dc-7f1c-43f2-919f-eb92c17ccf2b"
      source:"/app/apk/latest",
      target: --> Paste your link for the uploaded APK-file here <---
      status:302
    ) {
      target
    }
  }


## Configuration

### Environment Setup

Key configuration files:
- `app.json`: Expo app configuration
- `eas.json`: EAS Build configuration
- `package.json`: Dependencies and scripts

### Deep Linking

The app supports deep linking for Republik URLs:
- iOS: Associated domains configured for `republik.ch` and `www.republik.ch`
- Android: Intent filters for HTTPS scheme on Republik domains

### Push Notifications

Push notifications are configured with [Expo Notifications](https://docs.expo.dev/push-notifications/overview/) for both platforms with platform-specific setup required:
- iOS: APNs configuration
- Android: FCM configuration via `google-services.json`
