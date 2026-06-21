package com.moodhaven.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

private const val TAG = "OpenerPlugin"

/**
 * Opens a local file with the system viewer via an ACTION_VIEW intent, using the
 * app's FileProvider to grant the receiving app temporary read access.
 *
 * Android has no equivalent of the desktop `xdg-open`/`open` launchers, so
 * `open_media_attachment` (Rust) decrypts to a temp file and returns its path;
 * the frontend then calls this plugin to display it.
 */
@TauriPlugin
class OpenerPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun openFile(invoke: Invoke) {
        val path = invoke.getArgs().optString("path", "")
        if (path.isEmpty()) {
            invoke.reject("path is required")
            return
        }
        val file = File(path)
        if (!file.exists()) {
            invoke.reject("file not found: $path")
            return
        }
        try {
            val authority = "${activity.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, file)
            val ext = MimeTypeMap.getFileExtensionFromUrl(path).lowercase()
            val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                ?: "application/octet-stream"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("No app available to open this file type")
        } catch (e: Exception) {
            Log.w(TAG, "openFile failed: ${e.message}")
            invoke.reject("Could not open file: ${e.message}")
        }
    }

    /**
     * Shares a local file via an ACTION_SEND chooser (Drive, Files, email, etc.).
     *
     * Android has no save dialog, so exports (recovery PDF, .moodhaven backup, 2FA
     * backup codes) are written to app-private storage and then handed to the user
     * through the system share sheet via the app's FileProvider.
     */
    @Command
    fun shareFile(invoke: Invoke) {
        val path = invoke.getArgs().optString("path", "")
        if (path.isEmpty()) {
            invoke.reject("path is required")
            return
        }
        val file = File(path)
        if (!file.exists()) {
            invoke.reject("file not found: $path")
            return
        }
        try {
            val authority = "${activity.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, file)
            val ext = MimeTypeMap.getFileExtensionFromUrl(path).lowercase()
            val mime = invoke.getArgs().optString("mimeType", "").ifEmpty {
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                    ?: "application/octet-stream"
            }
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, null).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(chooser)
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("No app available to share this file")
        } catch (e: Exception) {
            Log.w(TAG, "shareFile failed: ${e.message}")
            invoke.reject("Could not share file: ${e.message}")
        }
    }
}
