#!/usr/bin/env bash
# Builds the Tracker Pro Android debug APK (and a signed release APK when a keystore is provided).
#
# Requirements: Node 20+, JDK 21, Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT set).
# Environment:
#   VITE_API_BASE_URL   https URL of your deployed Tracker Pro server (required for sign-in to work)
#   VERSION_CODE        integer Android versionCode (default 1)
#   VERSION_NAME        version string (default 1.0.0)
#   ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
#                       optional: also build a signed release APK
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
export APP_VERSION="${APP_VERSION:-$VERSION_NAME}"

if [ -z "${VITE_API_BASE_URL:-}" ]; then
  echo "WARNING: VITE_API_BASE_URL is not set. The APK will open, but sign-in and registration will show"
  echo "         'server address not configured' until you rebuild with your server's https URL."
elif [[ "${VITE_API_BASE_URL}" != https://* ]]; then
  echo "ERROR: VITE_API_BASE_URL must start with https://" >&2
  exit 1
fi

[ -d node_modules ] || npm install --no-audit --no-fund

echo "== Building web bundle"
npm run build

if [ ! -d android ]; then
  echo "== Creating Android project"
  npx cap add android
fi

echo "== Generating icons and splash screens"
npx capacitor-assets generate --android \
  --iconBackgroundColor '#5B2A55' --iconBackgroundColorDark '#5B2A55' \
  --splashBackgroundColor '#FBF7F1' --splashBackgroundColorDark '#19131A'

echo "== Syncing web assets and plugins"
npx cap sync android

echo "== Applying Android configuration"
GRADLE_FILE="android/app/build.gradle"
MANIFEST="android/app/src/main/AndroidManifest.xml"
perl -pi -e "s/versionCode \d+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE_FILE"
# Health records must never be copied to cloud backups.
perl -pi -e 's/android:allowBackup="true"/android:allowBackup="false"/' "$MANIFEST"
grep -q 'android:allowBackup="false"' "$MANIFEST" || { echo "ERROR: could not disable allowBackup" >&2; exit 1; }
grep -E "versionCode|versionName" "$GRADLE_FILE"

echo "== Assembling debug APK"
(cd android && ./gradlew assembleDebug --no-daemon --stacktrace)
DEBUG_APK="android/app/build/outputs/apk/debug/app-debug.apk"
test -f "$DEBUG_APK"
mkdir -p "$ROOT/dist-android"
cp "$DEBUG_APK" "$ROOT/dist-android/TrackerPro-${VERSION_NAME}-debug.apk"
echo "Debug APK: dist-android/TrackerPro-${VERSION_NAME}-debug.apk"

if [ -n "${ANDROID_KEYSTORE_FILE:-}" ] && [ -f "${ANDROID_KEYSTORE_FILE}" ]; then
  echo "== Assembling signed release APK"
  npx cap build android \
    --keystorepath "$ANDROID_KEYSTORE_FILE" \
    --keystorepass "$ANDROID_KEYSTORE_PASSWORD" \
    --keystorealias "$ANDROID_KEY_ALIAS" \
    --keystorealiaspass "$ANDROID_KEY_PASSWORD" \
    --androidreleasetype APK
  RELEASE_APK="$(ls android/app/build/outputs/apk/release/*.apk | head -n1)"
  cp "$RELEASE_APK" "$ROOT/dist-android/TrackerPro-${VERSION_NAME}-release.apk"
  echo "Release APK: dist-android/TrackerPro-${VERSION_NAME}-release.apk"
fi
