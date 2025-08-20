# Republik App

A React Native mobile application that provides a native wrapper for the [Republik.ch](https://www.republik.ch) website with enhanced audio playback capabilities.

## Overview

The Republik App is built with Expo and React Native, serving as a WebView wrapper for the Republik.ch website. The app enables browsing of Republik content while providing native mobile features like background audio playback, push notifications, and deep linking.

### Key Features

- **WebView Integration**: Renders the complete Republik.ch website
- **Background Audio Player**: Native audio controls using `react-native-track-player` for articles with audio content
- **Bidirectional Communication**: PostMessage API integration between the native app and web content
- **Deep Linking**: Support for `republik.ch` and `www.republik.ch` URLs
- **Push Notifications**: Native notification support

## Architecture

### Core Components

- **WebView Container** (`components/Web.tsx`): Main component that renders the Republik website and handles communication
- **Audio Player** (`components/AudioPlayer/HeadlessAudioPlayer.ts`): Headless audio player with native controls
- **Global State Management** (`lib/GlobalState.tsx`): Centralized state management for app-wide data
- **Services**: Background services for deep linking, push notifications, and playback

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

- Node.js > v18 (LTS version recommended)
- npm or yarn
- Expo CLI
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

As of August 4th 2025, the app uses an unreleased implementation of `react-native-track-player` that's compatible with Expo SDK 53. Due to the new architecture requirements, we're using a specific commit from the track-player repository:

```json
"react-native-track-player": "git+https://github.com/doublesymmetry/react-native-track-player.git#f3fc4d560154987dd7d341648b3ee6ac01972e15"
```

This should be replaced with alpha/beta/stable versions once released. We're doing this because we need to update the app to APK 31 until end of August 2025.

### Audio Features

- Background audio playback
- Native lock screen controls
- Queue management
- Playback speed control
- Progress synchronization with web UI

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

## Data Persistence & WebView Storage

### Problem

WebView-based applications face inherent challenges with data persistence across app restarts:

- **iOS WebView Storage Issues**: `WKWebView` uses separate cookie storage from Safari, and localStorage can be cleared unpredictably when the app is terminated ([react-native-webview#3572](https://github.com/react-native-webview/react-native-webview/issues/3572))
- **Android WebView Limitations**: WebView cookie and localStorage persistence varies across Android versions and can be unreliable after app closure
- **Expo Managed Workflow**: Limited access to native cookie management APIs that could provide more reliable storage

These issues resulted in users losing:
- **Login sessions** (cookies not persisting)
- **Audio playback preferences** (playback rate resetting to default)
- **User settings** stored in localStorage

### Solution: Native Storage with URL Persistence

The app implements a focused approach using **native storage reliability** with **periodic URL persistence**:

#### 1. Native Storage as Source of Truth
- Uses **MMKV** (via `react-native-mmkv`) for reliable, fast native storage
- Critical data is stored in native storage
- Survives app restarts, updates, and system reboots

#### 2. Periodic URL Persistence
- **Automatic URL Saving**: Every 5 seconds, saves the current WebView URL to native storage
- **Navigation Restoration**: On app restart, navigates back to the last saved URL
- **iOS Process Termination Resilience**: Ensures users return to their reading position even after unexpected app termination

#### 3. Implementation Details

**Data Flow:**
```
WebView URL → Native Storage (MMKV)
      ↓              ↑
   Navigation → Persist URL periodically
   App Restart → Navigate to saved URL
```

**Key Components:**

- **`components/Web.tsx`**: Handles periodic URL saving and navigation restoration
- **`components/AudioPlayer/HeadlessAudioPlayer.ts`**: Manages playback rate persistence
- **`lib/GlobalState.tsx`**: Provides MMKV-backed state management

**Data Persisted:**
- Current WebView URL (for navigation restoration)
- Audio playback rate
- Theme preferences

