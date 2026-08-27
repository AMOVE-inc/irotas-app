// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Store identifiers must remain unchanged after the first App Store / Play Store release.
// Override only before the first store record is created.
// Android requires each dot-separated segment to start with a letter
const rawBundleId =
  process.env.EXPO_PUBLIC_BUNDLE_IDENTIFIER ?? "com.irotas.community";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
const schemeFromBundleId = process.env.EXPO_PUBLIC_APP_SCHEME ?? "iroplus";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "IRO＋",
  appSlug: "irotas-app",
  // Hosted app logo used by screens that need an absolute URL.
  // Native and web preview icons use assets/images/irotas-logo-square.png below.
  logoUrl:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663131608042/RByLczUGFaawmetYWjMbRt/iro-plus-icon-SKFBtK8UGn5GJVQgZnQZza.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/irotas-logo-square.png",
  scheme: env.scheme,
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    versionCode: 1,
    permissions: ["POST_NOTIFICATIONS"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/irotas-logo-square.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission:
          "プロフィールや投稿に写真を追加するため、写真ライブラリへのアクセスを許可してください。",
        cameraPermission:
          "投稿用の写真を撮影するため、カメラへのアクセスを許可してください。",
        microphonePermission: false,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#E8A0BF",
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: false,
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
