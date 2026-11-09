package io.github.zheroz00.tddw;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;

/** Reads the recap page's address out of the config file's text, adds what is playing, and decides what stays in the app. */
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

    /**
     * The address with what is playing added to its query, for the service to read.
     * Without access to media sessions only np_access=0 is added, so the page can say why nothing is
     * known. With access but nothing playing the address is unchanged. Absent values are left out.
     */
    static String withNowPlaying(String url, NowPlaying nowPlaying, boolean hasAccess) {
        StringBuilder params = new StringBuilder();
        if (!hasAccess) {
            add(params, "np_access", "0");
        } else if (nowPlaying != null) {
            add(params, "np_app", nowPlaying.app);
            add(params, "np_title", nowPlaying.title);
            add(params, "np_artist", nowPlaying.artist);
            if (nowPlaying.positionMs >= 0) add(params, "np_pos", Long.toString(nowPlaying.positionMs));
            if (nowPlaying.durationMs > 0) add(params, "np_dur", Long.toString(nowPlaying.durationMs));
        }
        if (params.length() == 0) return url;

        int hash = url.indexOf('#');
        String fragment = hash < 0 ? "" : url.substring(hash);
        String base = hash < 0 ? url : url.substring(0, hash);
        boolean open = base.endsWith("?") || base.endsWith("&");
        String separator = base.indexOf('?') < 0 ? "?" : open ? "" : "&";
        return base + separator + params + fragment;
    }

    private static void add(StringBuilder params, String name, String value) {
        if (value == null || value.isEmpty()) return;
        if (params.length() > 0) params.append('&');
        params.append(name).append('=').append(encode(value));
    }

    /** Percent-encodes UTF-8, keeping only unreserved characters. URLEncoder would turn spaces into +. */
    private static String encode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xFF;
            boolean unreserved = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '-' || c == '.' || c == '_' || c == '~';
            if (unreserved) {
                out.append((char) c);
            } else {
                out.append('%').append(HEX[c >> 4]).append(HEX[c & 0xF]);
            }
        }
        return out.toString();
    }

    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private static URI toUri(String url) {
        try {
            return new URI(url);
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
