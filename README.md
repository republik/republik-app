# Republik App

A React Native mobile application that provides a native wrapper for the [Republik.ch](https://www.republik.ch) website with enhanced native capabilities.

## Overview

The Republik App is built with Expo SDK 55 and React Native 0.83, serving as a WebView wrapper for the Republik.ch website. The app enables browsing of Republik content while providing native mobile features like background audio playback, push notifications, and deep linking.

## Architecture

### Core Components

- **WebView Container** (`components/Web.tsx`): Main component that renders the Republik website and handles communication
- **Audio Player** (`components/AudioPlayer/ExpoAudioPlayer.tsx`): Headless React component using `expo-audio` with native lock screen controls
- **Global State Management** (`lib/GlobalState.tsx`): Centralized state management for app-wide data
- **Services**: Background services for deep linking, push notifications, and app state

### PostMessage Bridge

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

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

- `EXPO_PUBLIC_ENV`: Environment name (`development` or `production`)
- `EXPO_PUBLIC_FRONTEND_BASE_URL`: Base URL for the WebView (defaults to `https://www.republik.ch`)
- `SENTRY_AUTH_TOKEN`: Sentry auth token for source map uploads at build time (not bundled into the app)

### Key Files

- `app.json`: Expo app configuration
- `eas.json`: EAS Build configuration
- `package.json`: Dependencies and scripts

## Features

### Audio Player

`ExpoAudioPlayer` is a headless React component mounted at the app root alongside the WebView. It uses `expo-audio`'s `createAudioPlayer` API and communicates with the web layer entirely through the PostMessage bridge.

**Lazy initialization**: the track is set up via a `SETUP_TRACK` event before the user hits play. The audio session is started only when `PLAY` is received, reducing unnecessary resource usage.

- Background audio playback
- Native lock screen controls
- Playback speed control
- Forward / backward seek
- Progress synchronization with the web UI at 500 ms intervals while playing
- Android hardware back button collapses the expanded player UI
- Automatic state sync when the app returns to foreground

### URL Persistence

The app persists the WebView's current URL to MMKV storage so users return to their last-viewed page on next launch. Three complementary strategies ensure the URL is saved reliably:

1. **Navigation events**: The web frontend sends a `routeChange` postMessage on every navigation. On iOS, `onNavigationStateChange` also fires for `pushState` navigations. Both paths write to MMKV immediately.
2. **Periodic sync**: A 10-second interval reads `window.location.href` from the WebView and persists it if it differs from the stored value — a safety net in case a `routeChange` message is dropped.
3. **Background flush**: When the app transitions to background or inactive, a synchronous MMKV write is forced as a last-chance flush before the OS suspends the process.

> **Android note:** `onNavigationStateChange` does not fire for `history.pushState()` calls. SPA navigation on Android relies entirely on `routeChange` messages from the web frontend.

### Deep Linking

The app handles incoming `republik.ch` URLs and routes them directly into the WebView:

- iOS: Associated domains configured for `republik.ch` and `www.republik.ch`
- Android: Intent filters for HTTPS scheme on both domains

### Push Notifications

Push notifications are handled via [Expo Notifications](https://docs.expo.dev/push-notifications/overview/). Tapping a notification navigates the WebView to the notification's target URL.

- iOS: APNs configuration
- Android: FCM via `google-services.json`

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

Download the «Distribution APK» file from Google Play Console and upload it to the APK hosting location.

Make sure to update the APK download link at `republik.ch/app/apk/latest` so that it points to the newly uploaded file.