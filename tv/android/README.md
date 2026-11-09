# TD;DW Recap for Android TV

A tiny Android TV app (about 10 KB) that shows the TD;DW recap page on top of your player, with no browser in the way.

> 📸 **Screenshot needed:** the recap showing on a TV after pressing the remote button -> docs/images/tv-recap-app.png

## Why it exists

A browser works, but it is a poor fit on a TV. Some TV browsers show ads, getting back to your show can take several Backs, and a full-screen browser makes Android stop the player underneath. In Jellyfin for Android TV that means going back through its menus to resume.

This app's window is translucent, so Android only pauses the player instead of stopping it. One press of **Back** closes the recap, returns to the video and sends a play command.

## Before you start

- **The TV service has to be running.** This app only displays its page, so set up [the TV service](../README.md) first.
- **The address holds your key.** The config file stores your `TDDW_TV_KEY`, so treat it and the TV's ADB access like a password.
- **Plain HTTP is allowed.** The service has no HTTPS on the LAN, so the app permits cleartext traffic.
- **Android 8.0 or newer** with Android System WebView enabled.

## Build

You need JDK 17 and Android SDK platform 34, for example from Android Studio. From this folder:

```bash
./gradlew testReleaseUnitTest assembleRelease
```

The APK lands in `app/build/outputs/apk/release/app-release.apk`.

## Install and configure

With ADB connected to your TV:

```bash
adb push app/build/outputs/apk/release/app-release.apk /data/local/tmp/recap.apk
adb shell pm install -r /data/local/tmp/recap.apk
adb shell rm /data/local/tmp/recap.apk

# Open the app once. It creates its folder and shows where the address goes. Press Back.
adb shell am start -n io.github.zheroz00.tddw/.RecapActivity

# Save the TV view address in a file, then copy it over.
printf 'http://<host>:8795/?view=tv&key=<TDDW_TV_KEY>\n' > recap-url.txt
adb push recap-url.txt /sdcard/Android/data/io.github.zheroz00.tddw/files/recap-url.txt
rm recap-url.txt
```

Some firmware locks the shell out of `Android/data`. If the push is refused there, this setup won't work on that device as it stands.

## Map a remote button

In TV Quick Actions Pro: **Mappings > Add button**, press the button you want, set **Button action type** to **Usual action**, then set **Single press** to **APP > TD;DW Recap**.

## Limitations

- **Only tested on one setup so far:** Jellyfin for Android TV on a Chromecast with Google TV 4K (Android 14).
- **Back always sends a play command.** If nothing is paused, the command goes to whichever app last held media playback.
- **It shows as a tile in your launcher.** That is how TV Quick Actions can find it. Hide it in your launcher if it has that option.
- **Viewing only.** Follow-up questions stay on the phone view.
