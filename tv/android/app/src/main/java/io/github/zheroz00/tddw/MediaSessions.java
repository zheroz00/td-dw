package io.github.zheroz00.tddw;

import android.content.ComponentName;
import android.content.Context;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/** Reads the active media sessions and picks the one the recap is about. */
final class MediaSessions {
    private static final String TAG = "TDDW";

    private MediaSessions() {}

    /** What reading the sessions found. controller and nowPlaying are null when nothing was picked. */
    static final class Result {
        /** False when the notification listener has not been granted, so sessions cannot be read. */
        final boolean hasAccess;
        final MediaController controller;
        /** True when the picked session was playing or buffering when it was read. */
        final boolean playing;
        final NowPlaying nowPlaying;

        Result(boolean hasAccess, MediaController controller, boolean playing, NowPlaying nowPlaying) {
            this.hasAccess = hasAccess;
            this.controller = controller;
            this.playing = playing;
            this.nowPlaying = nowPlaying;
        }
    }

    static Result read(Context context) {
        MediaSessionManager manager = context.getSystemService(MediaSessionManager.class);
        if (manager == null) return new Result(false, null, false, null);
        List<MediaController> controllers;
        try {
            controllers = manager.getActiveSessions(new ComponentName(context, MediaListener.class));
        } catch (SecurityException e) {
            return new Result(false, null, false, null);
        }
        if (controllers == null) controllers = new ArrayList<>();

        List<NowPlaying.Playback> states = new ArrayList<>();
        for (MediaController controller : controllers) {
            states.add(playbackOf(controller.getPlaybackState()));
        }
        int index = NowPlaying.pick(states);
        if (index < 0) return new Result(true, null, false, null);

        MediaController picked = controllers.get(index);
        boolean playing = states.get(index) == NowPlaying.Playback.PLAYING;
        logMetadata(picked);
        return new Result(true, picked, playing, describe(picked, playing));
    }

    private static NowPlaying.Playback playbackOf(PlaybackState state) {
        if (state == null) return NowPlaying.Playback.OTHER;
        switch (state.getState()) {
            case PlaybackState.STATE_PLAYING:
            case PlaybackState.STATE_BUFFERING:
                return NowPlaying.Playback.PLAYING;
            case PlaybackState.STATE_PAUSED:
                return NowPlaying.Playback.PAUSED;
            default:
                return NowPlaying.Playback.OTHER;
        }
    }

    private static NowPlaying describe(MediaController controller, boolean playing) {
        String title = null;
        String artist = null;
        long duration = NowPlaying.ABSENT;
        MediaMetadata metadata = controller.getMetadata();
        if (metadata != null) {
            MediaDescription description = metadata.getDescription();
            title = text(description.getTitle());
            artist = text(description.getSubtitle());
            duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
        }
        long position = NowPlaying.ABSENT;
        PlaybackState state = controller.getPlaybackState();
        if (state != null) {
            position = NowPlaying.positionMs(playing, state.getPosition(), state.getPlaybackSpeed(),
                    state.getLastPositionUpdateTime(), SystemClock.elapsedRealtime());
        }
        return new NowPlaying(controller.getPackageName(), title, artist, position, duration);
    }

    private static String text(CharSequence value) {
        return value == null ? null : value.toString();
    }

    /** Logs every metadata field so we can see what an app like Prime Video really publishes. */
    private static void logMetadata(MediaController controller) {
        Log.d(TAG, "session " + controller.getPackageName());
        MediaMetadata metadata = controller.getMetadata();
        if (metadata == null) {
            Log.d(TAG, "  no metadata");
            return;
        }
        for (String key : metadata.keySet()) {
            CharSequence value = metadata.getText(key);
            Log.d(TAG, "  " + key + " = " + (value != null ? value : "<non-text>"));
        }
    }
}
