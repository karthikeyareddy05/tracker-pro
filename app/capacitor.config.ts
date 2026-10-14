import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.floot.u774e670795c742c7be55c4d5d9f4279b",
  appName: "Tracker Pro",
  webDir: "dist",
  android: {
    allowMixedContent: false,
    // Release builds must never expose the WebView to remote debugging.
    webContentsDebuggingEnabled: false,
    adjustMarginsForEdgeToEdge: "auto",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#FBF7F1",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
