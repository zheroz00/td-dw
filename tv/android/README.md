# TD;DW Recap for Android TV

A tiny Android TV app (about 15 KB) that shows the TD;DW recap page on top of your player, with no browser in the way. It also reads what is playing, so YouTube works as well as Jellyfin.

> 📸 **Screenshot needed:** the recap showing on a TV after pressing the remote button -> docs/images/tv-recap-app.png

## Why it exists

A browser works, but it is a poor fit on a TV. Some TV browsers show ads, getting back to your show can take several Backs, and a full-screen browser makes Android stop the player underneath. In Jellyfin for Android TV that means going back through its menus to resume.

This app's window is translucent, so Android only pauses the player instead of stopping it. One press of **Back** closes the recap, returns to the video and resumes it.

## What it does

- **Jellyfin:** the TD;DW service pauses the video when it starts a recap. Back sends a play command.
- **YouTube (and other apps that publish a media session):** on launch the app reads the title, channel and position from the playing session and passes them to the page in the address (`np_*` parameters). YouTube keeps playing under a translucent window, so the app pauses it, then plays it again on Back. If you had already paused the video yourself, Back leaves it paused.
- **No notification access:** the app can't see what is playing, so it tells the page (`np_access=0`) and the page shows a note. Only Jellyfin recaps work in that case.

The app also writes the fields a player publishes to logcat under the tag `TDDW` (never the page address, which holds your key). That is there to find out what apps like Prime Video expose.

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

### Notification access

Reading what is playing needs a notification listener grant. Android gives that to an app the user enabled, so without it the app can only handle Jellyfin. Grant it over ADB now, while you still have ADB open:

```bash
adb shell cmd notification allow_listener io.github.zheroz00.tddw/io.github.zheroz00.tddw.MediaListener
```

The app does not read or store any notifications. The listener service is empty, and only exists because Android ties media session access to it.

Some devices also list the app under **Settings > Apps > Special app access > Notification access**, where it can be switched on by hand. That route is not verified on the Shield, so don't count on it if you plan to turn ADB off.

## Map a remote button

In TV Quick Actions Pro: **Mappings > Add button**, press the button you want, set **Button action type** to **Usual action**, then set **Single press** to **APP > TD;DW Recap**.

## Limitations

- **Tested so far:** Jellyfin for Android TV on a Chromecast with Google TV 4K (Android 14). The media session reading (version 0.2.0) has unit tests for the session choice, position maths and address encoding, but has not been tested on a Shield yet.
- **Without notification access only Jellyfin works.** The page shows a note instead of the recap for other apps.
- **Back resumes only what the app paused.** For Jellyfin, or when nothing readable was playing, it still sends a media play key, which goes to whichever app last held media playback. A video you paused yourself in another app is left alone.
- **Some apps publish little.** An app's media session may have no real title, or none at all, and the position can be a few seconds off.
- **It shows as a tile in your launcher.** That is how TV Quick Actions can find it. Hide it in your launcher if it has that option.
- **Viewing only.** Follow-up questions stay on the phone view.
