package com.aviozkfir.financefamily;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before the web view picks which content to load.
        AppUpdaterPlugin.rollBackIfUnconfirmed(this);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(AppFilesPlugin.class);
        super.onCreate(savedInstanceState);

        // The phone's back button goes to the previous screen. On the home screen it leaves the
        // app (which keeps running in the background) instead of walking further back in history.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView web = getBridge() != null ? getBridge().getWebView() : null;
                        String url = web != null ? web.getUrl() : null;
                        // Screens are addressed after the '#': "https://localhost/#/month/2026-11".
                        int hash = url == null ? -1 : url.indexOf('#');
                        String route = hash < 0 ? "/" : url.substring(hash + 1);
                        boolean home = route.isEmpty() || route.equals("/");
                        if (web == null || home) {
                            moveTaskToBack(true);
                        } else if (web.canGoBack()) {
                            web.goBack();
                        } else {
                            web.evaluateJavascript("location.hash = '#/'", null);
                        }
                    }
                }
            );
    }
}
