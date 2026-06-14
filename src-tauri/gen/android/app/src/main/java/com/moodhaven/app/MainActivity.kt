package com.moodhaven.app

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.tauri.plugin.PluginManager

class MainActivity : TauriActivity() {
  // Held for the app's lifetime so mdns-sd can receive multicast peer-discovery
  // packets. Android drops multicast to the app unless a MulticastLock is held;
  // without it, peer discovery silently finds nothing (only direct TCP works).
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    super.onCreate(savedInstanceState)
    // The generated TauriActivity for this project omits the codegen's
    // `PluginManager.onActivityCreate(this)` call, so the Tauri PluginManager's
    // startActivityForResultLauncher is never registered. Any plugin that opens a
    // system activity for a result — e.g. tauri-plugin-dialog's file picker —
    // then throws "lateinit property startActivityForResultLauncher has not been
    // initialized" and silently fails to launch. Register it here (idempotent: the
    // manager guards on `activity.isInitialized`). Custom plugins are loaded after
    // super.onCreate() so the activity/launcher are set up first.
    PluginManager.onActivityCreate(this)
    getPluginManager().load(null, "biometric", BiometricPlugin(this), "{}")
    getPluginManager().load(null, "wear", WearPlugin(this), "{}")
    getPluginManager().load(null, "opener", OpenerPlugin(this), "{}")
    getPluginManager().load(null, "securekey", SecureKeyPlugin(this), "{}")
    acquireMulticastLock()
    enableEdgeToEdge()
  }

  private fun acquireMulticastLock() {
    try {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      multicastLock = wifi?.createMulticastLock("moodhaven-mdns")?.apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (e: Exception) {
      // Non-fatal: discovery degrades to direct-connect only.
      Log.w("MoodHaven", "Failed to acquire multicast lock: ${e.message}")
    }
  }

  override fun onDestroy() {
    try {
      multicastLock?.takeIf { it.isHeld }?.release()
    } catch (e: Exception) {
      Log.w("MoodHaven", "Failed to release multicast lock: ${e.message}")
    }
    multicastLock = null
    super.onDestroy()
  }
}
