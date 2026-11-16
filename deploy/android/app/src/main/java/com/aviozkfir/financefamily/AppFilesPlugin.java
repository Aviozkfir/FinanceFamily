package com.aviozkfir.financefamily;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hands a file made by the app (a backup, an export) to Android's share sheet, so the user can
 * save it to their files, to a drive, or send it to themselves. A web view cannot download.
 */
@CapacitorPlugin(name = "AppFiles")
public class AppFilesPlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String name = call.getString("name");
        String text = call.getString("text");
        String mime = call.getString("mime", "application/octet-stream");
        if (name == null || text == null || name.contains("/") || name.contains("\\") || name.startsWith(".")) {
            call.reject("A plain file name and its text are required");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("Could not create the export folder");
            File file = new File(dir, name);
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, name);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), e);
        }
    }
}
