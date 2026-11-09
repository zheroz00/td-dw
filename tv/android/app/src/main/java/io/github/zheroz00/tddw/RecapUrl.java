package io.github.zheroz00.tddw;

import java.net.URI;
import java.net.URISyntaxException;

/** Reads the recap page's address out of the config file's text, and decides what stays in the app. */
final class RecapUrl {
    private RecapUrl() {}

    /** The address to load, or null when the text is not an http(s) URL with a host. */
    static String parse(String text) {
        if (text == null) return null;
        String url = text.trim();
        URI uri = toUri(url);
        if (uri == null || uri.getHost() == null || uri.getScheme() == null) return null;
        String scheme = uri.getScheme().toLowerCase();
        return scheme.equals("http") || scheme.equals("https") ? url : null;
    }

    /** True when both addresses are on the same scheme, host and port. */
    static boolean sameOrigin(String a, String b) {
        URI first = toUri(a);
        URI second = toUri(b);
        if (first == null || second == null || first.getHost() == null || second.getHost() == null) return false;
        return first.getScheme().equalsIgnoreCase(second.getScheme())
                && first.getHost().equalsIgnoreCase(second.getHost())
                && first.getPort() == second.getPort();
    }

    private static URI toUri(String url) {
        try {
            return new URI(url);
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
