package io.github.zheroz00.tddw;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class RecapUrlTest {
    private static final String PAGE = "http://192.168.1.50:8795/?view=tv&key=abc";

    @Test
    public void keepsAnHttpAddressAndTrimsTheFile() {
        assertEquals(PAGE, RecapUrl.parse("  " + PAGE + "\n"));
        assertEquals("https://tv.example.com/", RecapUrl.parse("https://tv.example.com/"));
    }

    @Test
    public void refusesAnythingElse() {
        assertNull(RecapUrl.parse(null));
        assertNull(RecapUrl.parse(""));
        assertNull(RecapUrl.parse("192.168.1.50:8795"));
        assertNull(RecapUrl.parse("file:///sdcard/page.html"));
        assertNull(RecapUrl.parse("javascript:alert(1)"));
        assertNull(RecapUrl.parse("http://bad host/"));
    }

    @Test
    public void sameOriginComparesSchemeHostAndPort() {
        assertTrue(RecapUrl.sameOrigin(PAGE, "http://192.168.1.50:8795/static/app.js"));
        assertFalse(RecapUrl.sameOrigin(PAGE, "http://192.168.1.50:9000/"));
        assertFalse(RecapUrl.sameOrigin(PAGE, "https://192.168.1.50:8795/"));
        assertFalse(RecapUrl.sameOrigin(PAGE, "http://example.com:8795/"));
        assertFalse(RecapUrl.sameOrigin(PAGE, "not a url"));
    }

    private static NowPlaying playing(String app, String title, String artist, long pos, long dur) {
        return new NowPlaying(app, title, artist, pos, dur);
    }

    @Test
    public void addsEveryNowPlayingFieldAfterTheExistingQuery() {
        NowPlaying np = playing("com.google.android.youtube.tv", "Some Title", "Some Channel", 12_345, 600_000);
        assertEquals(PAGE + "&np_app=com.google.android.youtube.tv&np_title=Some%20Title"
                        + "&np_artist=Some%20Channel&np_pos=12345&np_dur=600000",
                RecapUrl.withNowPlaying(PAGE, np, true));
    }

    @Test
    public void startsAQueryWhenTheAddressHasNone() {
        NowPlaying np = playing("app", null, null, NowPlaying.ABSENT, NowPlaying.ABSENT);
        assertEquals("http://tv.local:8795/?np_app=app", RecapUrl.withNowPlaying("http://tv.local:8795/", np, true));
    }

    @Test
    public void doesNotDoubleASeparatorAlreadyAtTheEnd() {
        NowPlaying np = playing("app", null, null, NowPlaying.ABSENT, NowPlaying.ABSENT);
        assertEquals("http://h/?np_app=app", RecapUrl.withNowPlaying("http://h/?", np, true));
        assertEquals("http://h/?a=1&np_app=app", RecapUrl.withNowPlaying("http://h/?a=1&", np, true));
    }

    @Test
    public void encodesSpacesAsPercent20AndNeverPlus() {
        String url = RecapUrl.withNowPlaying(PAGE, playing("app", "a b+c", null, NowPlaying.ABSENT, NowPlaying.ABSENT), true);
        assertTrue(url, url.endsWith("&np_app=app&np_title=a%20b%2Bc"));
        assertFalse(url.substring(PAGE.length()).contains("+"));
    }

    @Test
    public void encodesReservedCharactersInATitle() {
        String url = RecapUrl.withNowPlaying(PAGE, playing(null, "Q&A #1? yes=no/%", null, NowPlaying.ABSENT, NowPlaying.ABSENT), true);
        assertEquals(PAGE + "&np_title=Q%26A%20%231%3F%20yes%3Dno%2F%25", url);
    }

    @Test
    public void encodesNonAsciiTitlesAsUtf8() {
        String url = RecapUrl.withNowPlaying(PAGE, playing(null, "Caf\u00e9 \u65e5\u672c", null, NowPlaying.ABSENT, NowPlaying.ABSENT), true);
        assertEquals(PAGE + "&np_title=Caf%C3%A9%20%E6%97%A5%E6%9C%AC", url);
    }

    @Test
    public void keepsAFragmentLast() {
        NowPlaying np = playing("app", "t", null, NowPlaying.ABSENT, NowPlaying.ABSENT);
        assertEquals("http://h/?key=k&np_app=app&np_title=t#top", RecapUrl.withNowPlaying("http://h/?key=k#top", np, true));
        assertEquals("http://h/?np_app=app#top", RecapUrl.withNowPlaying("http://h/#top", playing("app", null, null, -1, -1), true));
    }

    @Test
    public void withoutAccessOnlyAddsNpAccessZero() {
        NowPlaying np = playing("app", "t", "a", 1, 2);
        assertEquals(PAGE + "&np_access=0", RecapUrl.withNowPlaying(PAGE, np, false));
        assertEquals(PAGE + "&np_access=0", RecapUrl.withNowPlaying(PAGE, null, false));
        assertEquals("http://h/?np_access=0#f", RecapUrl.withNowPlaying("http://h/#f", null, false));
    }

    @Test
    public void withAccessAndNothingPickedTheAddressIsUnchanged() {
        assertEquals(PAGE, RecapUrl.withNowPlaying(PAGE, null, true));
        assertEquals(PAGE, RecapUrl.withNowPlaying(PAGE, playing(null, null, null, -1, -1), true));
    }

    @Test
    public void leavesOutAbsentAndEmptyFields() {
        assertEquals(PAGE + "&np_app=app&np_pos=0",
                RecapUrl.withNowPlaying(PAGE, playing("app", "", null, 0, 0), true));
    }

    @Test
    public void theKeyParameterSurvivesIntact() {
        String key = "http://192.168.1.50:8795/?view=tv&key=Ab-1_2.3~x";
        String url = RecapUrl.withNowPlaying(key, playing("app", "t", "a", 5, 10), true);
        assertTrue(url, url.startsWith(key + "&np_app=app"));
    }
}
