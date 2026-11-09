package io.github.zheroz00.tddw;

import static io.github.zheroz00.tddw.NowPlaying.ABSENT;
import static io.github.zheroz00.tddw.NowPlaying.Playback.OTHER;
import static io.github.zheroz00.tddw.NowPlaying.Playback.PAUSED;
import static io.github.zheroz00.tddw.NowPlaying.Playback.PLAYING;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;

import org.junit.Test;

public class NowPlayingTest {
    @Test
    public void picksTheFirstPlayingSession() {
        assertEquals(1, NowPlaying.pick(Arrays.asList(PAUSED, PLAYING, PLAYING)));
        assertEquals(2, NowPlaying.pick(Arrays.asList(OTHER, PAUSED, PLAYING)));
    }

    @Test
    public void picksTheFirstPausedSessionWhenNothingPlays() {
        assertEquals(1, NowPlaying.pick(Arrays.asList(OTHER, PAUSED, PAUSED)));
    }

    @Test
    public void picksNothingWhenNothingPlaysOrPauses() {
        assertEquals(-1, NowPlaying.pick(Arrays.asList(OTHER, OTHER)));
        assertEquals(-1, NowPlaying.pick(Collections.<NowPlaying.Playback>emptyList()));
        assertEquals(-1, NowPlaying.pick(null));
    }

    @Test
    public void aSessionWithNoPlaybackStateIsSkipped() {
        assertEquals(2, NowPlaying.pick(Arrays.asList(null, PAUSED, PLAYING)));
        assertEquals(1, NowPlaying.pick(Arrays.asList(null, PAUSED)));
        assertEquals(-1, NowPlaying.pick(Arrays.asList(null, null)));
    }

    @Test
    public void aPlayingPositionMovesForwardAtTheSpeed() {
        assertEquals(15_000, NowPlaying.positionMs(true, 10_000, 1f, 1_000, 6_000));
        assertEquals(20_000, NowPlaying.positionMs(true, 10_000, 2f, 1_000, 6_000));
        assertEquals(10_000, NowPlaying.positionMs(true, 10_000, 0f, 1_000, 6_000));
    }

    @Test
    public void aPausedPositionIsUsedAsReported() {
        assertEquals(10_000, NowPlaying.positionMs(false, 10_000, 1f, 1_000, 6_000));
    }

    @Test
    public void aMissingPositionStaysAbsent() {
        assertEquals(ABSENT, NowPlaying.positionMs(true, -1, 1f, 1_000, 6_000));
        assertEquals(ABSENT, NowPlaying.positionMs(false, -1, 1f, 1_000, 6_000));
    }

    @Test
    public void positionIsNeverNegative() {
        assertEquals(0, NowPlaying.positionMs(true, 1_000, -2f, 1_000, 6_000));
        assertEquals(0, NowPlaying.positionMs(false, 0, 1f, 1_000, 6_000));
    }

    @Test
    public void aClockThatHasNotMovedOrIsUnsetDoesNotExtrapolate() {
        assertEquals(10_000, NowPlaying.positionMs(true, 10_000, 1f, 6_000, 6_000));
        assertEquals(10_000, NowPlaying.positionMs(true, 10_000, 1f, 9_000, 6_000));
        assertEquals(10_000, NowPlaying.positionMs(true, 10_000, 1f, 0, 6_000));
    }

    @Test
    public void unknownPositionAndDurationAreNormalisedToAbsent() {
        NowPlaying unknown = new NowPlaying("app", "t", "a", -5, 0);
        assertEquals(ABSENT, unknown.positionMs);
        assertEquals(ABSENT, unknown.durationMs);
        NowPlaying known = new NowPlaying("app", "t", "a", 0, 90_000);
        assertEquals(0, known.positionMs);
        assertEquals(90_000, known.durationMs);
    }

    @Test
    public void recognisesJellyfinByPackage() {
        assertTrue(NowPlaying.isJellyfin("org.jellyfin.androidtv"));
        assertFalse(NowPlaying.isJellyfin("com.google.android.youtube.tv"));
        assertFalse(NowPlaying.isJellyfin(null));
    }
}
