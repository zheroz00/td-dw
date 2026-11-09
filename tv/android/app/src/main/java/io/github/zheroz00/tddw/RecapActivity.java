package io.github.zheroz00.tddw;

import android.app.Activity;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Shows the TD;DW recap page over the player, and goes straight back to it on Back.
 *
 * The window is translucent (RecapTheme) on purpose: Android then only pauses the activity underneath
 * instead of stopping it, which is what a full-screen browser does and what ends Jellyfin's playback.
 */
public final class RecapActivity extends Activity {
    private static final String CONFIG_FILE = "recap-url.txt";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        File config = new File(getExternalFilesDir(null), CONFIG_FILE);
        String url = RecapUrl.parse(read(config));
        if (url == null) {
            showMessage(getString(R.string.no_config, config.getAbsolutePath()));
            return;
        }
        openRecap(url);
    }

    private void openRecap(String url) {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        webView.setWebViewClient(new RecapClient(url));
        setContentView(webView);
        webView.requestFocus();
        webView.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        resumePlayer();
        finish();
    }

    /** The recap page pauses the player when it starts a recap, so closing it plays again. */
    private void resumePlayer() {
        AudioManager audio = getSystemService(AudioManager.class);
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY));
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY));
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void showMessage(String message) {
        TextView view = new TextView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setTextColor(Color.WHITE);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        view.setGravity(Gravity.CENTER);
        int padding = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 48, getResources().getDisplayMetrics());
        view.setPadding(padding, padding, padding, padding);
        view.setText(message);
        setContentView(view);
    }

    private static String read(File file) {
        try {
            return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private final class RecapClient extends WebViewClient {
        private final String pageUrl;

        RecapClient(String pageUrl) {
            this.pageUrl = pageUrl;
        }

        /** The page is all this app is for, so it never follows a link off the recap server. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri target = request.getUrl();
            return !RecapUrl.sameOrigin(pageUrl, target.toString());
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                showMessage(getString(R.string.no_connection));
            }
        }

        /** Without this, a crashed WebView renderer takes the whole app down with it. */
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            finish();
            return true;
        }
    }
}
