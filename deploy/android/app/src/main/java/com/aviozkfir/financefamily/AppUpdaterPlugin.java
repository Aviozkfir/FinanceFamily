package com.aviozkfir.financefamily;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.WebView;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * In-app updates.
 *
 * A content update downloads a zip of the web app, unpacks it into the app's private storage
 * and points the web view at it. Capacitor remembers that folder (and drops it by itself when
 * a new APK is installed). If the new content never reports that it started, the next launch
 * goes back to the content that shipped inside the APK.
 *
 * An APK update downloads the package and hands it to the system installer.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String PREFS = "AppUpdater";
    private static final String PENDING = "pendingBuild";
    private static final String ROLLED_BACK = "rolledBackBuild";
    private static final String BUNDLES_DIR = "bundles";

    /** Called at launch, before the web view loads: gives up on content that never confirmed it works. */
    static void rollBackIfUnconfirmed(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int pending = prefs.getInt(PENDING, 0);
        if (pending == 0) return;
        context
            .getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(WebView.CAP_SERVER_PATH, "")
            .commit();
        prefs.edit().remove(PENDING).putInt(ROLLED_BACK, pending).commit();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("native", BuildConfig.NATIVE_LEVEL);
        ret.put("rolledBackBuild", prefs().getInt(ROLLED_BACK, 0));
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("apkVersion", info.versionName);
            ret.put("apkBuild", info.versionCode);
        } catch (Exception ignored) {}
        call.resolve(ret);
    }

    /** The running content started fine: keep it, and delete content folders that are no longer used. */
    @PluginMethod
    public void confirm(PluginCall call) {
        prefs().edit().remove(PENDING).apply();
        String current = bridge.getServerBasePath();
        File[] dirs = new File(getContext().getFilesDir(), BUNDLES_DIR).listFiles();
        if (dirs != null) {
            for (File dir : dirs) {
                if (current == null || !dir.getAbsolutePath().equals(current)) deleteRecursively(dir);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void applyBundle(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        Integer build = call.getInt("build");
        if (url == null || build == null || build <= 0) {
            call.reject("url and build are required");
            return;
        }
        new Thread(() -> {
            File root = new File(getContext().getFilesDir(), BUNDLES_DIR);
            File zip = new File(getContext().getCacheDir(), "bundle-" + build + ".zip");
            File tmp = new File(root, build + ".tmp");
            File dir = new File(root, String.valueOf(build));
            try {
                download(url, token, zip);
                deleteRecursively(tmp);
                deleteRecursively(dir);
                unzip(zip, tmp);
                if (!new File(tmp, "index.html").isFile()) throw new IOException("The update has no index.html");
                if (!tmp.renameTo(dir)) throw new IOException("Could not move the update into place");

                prefs().edit().putInt(PENDING, build).remove(ROLLED_BACK).commit();
                getContext()
                    .getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(WebView.CAP_SERVER_PATH, dir.getAbsolutePath())
                    .commit();
                call.resolve();
                // Reloads the web view from the new folder.
                getActivity().runOnUiThread(() -> bridge.setServerBasePath(dir.getAbsolutePath()));
            } catch (Exception e) {
                deleteRecursively(tmp);
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), e);
            } finally {
                zip.delete();
            }
        })
            .start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "update");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Could not create the download folder");
                File apk = new File(dir, "FinanceFamily.apk");
                download(url, token, apk);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), e);
            }
        })
            .start();
    }

    /**
     * Downloads a GitHub release asset. GitHub answers with a redirect to a signed storage link;
     * that second request must go out without the token, so redirects are followed by hand.
     */
    private void download(String address, String token, File target) throws IOException {
        URL url = new URL(address);
        boolean first = true;
        for (int hop = 0; hop < 6; hop++) {
            if (!"https".equals(url.getProtocol())) throw new IOException("Refusing a download that is not https");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("Accept", "application/octet-stream");
            conn.setRequestProperty("User-Agent", "FinanceFamily-app");
            if (first && token != null && !token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
            try {
                int status = conn.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = conn.getHeaderField("Location");
                    if (location == null) throw new IOException("Redirect without a location");
                    url = new URL(url, location);
                    first = false;
                    continue;
                }
                if (status != 200) throw new IOException("Download failed (HTTP " + status + ")");
                long total = conn.getContentLength();
                long done = 0;
                int lastPercent = -1;
                byte[] buffer = new byte[64 * 1024];
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        out.write(buffer, 0, n);
                        done += n;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject progress = new JSObject();
                                progress.put("percent", percent);
                                notifyListeners("progress", progress);
                            }
                        }
                    }
                }
                return;
            } finally {
                conn.disconnect();
            }
        }
        throw new IOException("Too many redirects");
    }

    private static void unzip(File zip, File dir) throws IOException {
        if (!dir.mkdirs()) throw new IOException("Could not create the update folder");
        String base = dir.getCanonicalPath() + File.separator;
        byte[] buffer = new byte[64 * 1024];
        try (ZipInputStream in = new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                File out = new File(dir, entry.getName());
                // An entry must not climb out of the update folder.
                if (!out.getCanonicalPath().startsWith(base)) throw new IOException("Bad path in the update: " + entry.getName());
                if (entry.isDirectory()) {
                    if (!out.isDirectory() && !out.mkdirs()) throw new IOException("Could not create " + entry.getName());
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Could not create " + parent.getName());
                try (OutputStream os = new FileOutputStream(out)) {
                    int n;
                    while ((n = in.read(buffer)) > 0) os.write(buffer, 0, n);
                }
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
