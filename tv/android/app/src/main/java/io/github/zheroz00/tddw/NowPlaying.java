package io.github.zheroz00.tddw;

import java.util.List;

/**
 * What the player showed when the recap was opened, plus the pure rules for choosing a session and
 * working out where it was. Deliberately free of Android types so it can be unit tested on a plain JVM.
 */
final class NowPlaying {
    /** Package of Jellyfin for Android TV, which the TD;DW service pauses itself. */
    static final String JELLYFIN_PACKAGE = "org.jellyfin.androidtv";

    /** Marks a position or duration that is not known. Known values are never negative. */
    static final long ABSENT = -1;

    /** How a media session reports itself, reduced to what the choice needs. */
    enum Playback { PLAYING, PAUSED, OTHER }

    final String app;
    final String title;
    final String artist;
    final long positionMs;
    final long durationMs;

    NowPlaying(String app, String title, String artist, long positionMs, long durationMs) {
        this.app = app;
        this.title = title;
        this.artist = artist;
        this.positionMs = positionMs < 0 ? ABSENT : positionMs;
        this.durationMs = durationMs <= 0 ? ABSENT : durationMs;
    }

    static boolean isJellyfin(String app) {
        return JELLYFIN_PACKAGE.equals(app);
    }

    /**
     * Index of the session to use: the first one playing, otherwise the first paused one, otherwise -1.
     * A null entry (a session with no playback state) counts as neither.
     */
    static int pick(List<Playback> sessions) {
        if (sessions == null) return -1;
        int firstPaused = -1;
        for (int i = 0; i < sessions.size(); i++) {
            Playback state = sessions.get(i);
            if (state == Playback.PLAYING) return i;
            if (state == Playback.PAUSED && firstPaused < 0) firstPaused = i;
        }
        return firstPaused;
    }

    /**
     * Where playback is now, in milliseconds, or ABSENT when the session gave no position. A playing
     * session's position is a snapshot taken at updateTimeMs, so it is moved forward by the time since
     * then at the playback speed. A paused one is used as reported. Both clocks are elapsedRealtime.
     */
    static long positionMs(boolean playing, long reportedMs, float speed, long updateTimeMs, long nowMs) {
        if (reportedMs < 0) return ABSENT;
        if (!playing || updateTimeMs <= 0 || nowMs <= updateTimeMs) return reportedMs;
        long position = reportedMs + (long) (speed * (nowMs - updateTimeMs));
        return Math.max(0, position);
    }
}
