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
}
