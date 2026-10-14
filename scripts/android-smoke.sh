#!/usr/bin/env bash
# Installs the debug APK on a running emulator, launches it twice (fresh start
# and relaunch), captures screenshots, the UI hierarchy and logcat, and fails
# if the app crashes or is not running.
set -uo pipefail

APK="$1"
OUT="${2:-smoke-out}"
PKG="app.floot.u774e670795c742c7be55c4d5d9f4279b"
mkdir -p "$OUT"
exec > >(tee -a "$OUT/console.log") 2>&1

adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true

echo "== install"
adb install -r "$APK" | tee "$OUT/install.txt"

adb logcat -c
echo "== first launch"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 30
adb exec-out screencap -p > "$OUT/01-first-launch.png"
adb shell uiautomator dump /sdcard/ui1.xml >/dev/null 2>&1 && adb pull /sdcard/ui1.xml "$OUT/ui-first-launch.xml" >/dev/null 2>&1
PID1=$(adb shell pidof "$PKG" | tr -d '\r' || true)

echo "== relaunch after force-stop"
adb shell am force-stop "$PKG"
sleep 2
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 20
adb exec-out screencap -p > "$OUT/02-relaunch.png"
adb shell uiautomator dump /sdcard/ui2.xml >/dev/null 2>&1 && adb pull /sdcard/ui2.xml "$OUT/ui-relaunch.xml" >/dev/null 2>&1
PID2=$(adb shell pidof "$PKG" | tr -d '\r' || true)

echo "== back button on login screen should leave the app without crashing"
adb shell input keyevent KEYCODE_BACK
sleep 3

adb logcat -d > "$OUT/logcat-full.txt"
grep -iE "$PKG|Capacitor|chromium|AndroidRuntime|SQLite|WebView|Console" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode|targetSdk|minSdk|allowBackup|flags=" > "$OUT/package.txt" || true

STATUS=0
if grep -n "FATAL EXCEPTION" "$OUT/logcat-full.txt" >/dev/null; then
  if grep -A8 "FATAL EXCEPTION" "$OUT/logcat-full.txt" | grep -q "$PKG"; then
    echo "FAIL: app crashed"
    grep -A30 "FATAL EXCEPTION" "$OUT/logcat-full.txt" | head -80
    STATUS=1
  fi
fi
if [ -z "$PID1" ] || [ -z "$PID2" ]; then
  echo "FAIL: app process was not running after launch (pid1='$PID1' pid2='$PID2')"
  STATUS=1
fi
if grep -E "E Capacitor/Console" "$OUT/logcat-app.txt" | grep -q "Uncaught"; then
  echo "FAIL: uncaught JavaScript error in the app:"
  grep -E "E Capacitor/Console" "$OUT/logcat-app.txt" | head -20
  STATUS=1
fi
# The first screen for a signed-out user is the login page; make sure it actually rendered
# (and the app isn't stuck on the launch screen).
for f in "$OUT/ui-first-launch.xml" "$OUT/ui-relaunch.xml"; do
  if ! grep -q "Welcome back" "$f" 2>/dev/null; then
    echo "FAIL: login screen text not found in $(basename "$f")"
    STATUS=1
  fi
done
echo "pid1=$PID1 pid2=$PID2 status=$STATUS" | tee "$OUT/result.txt"
exit $STATUS
