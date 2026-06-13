package com.moodhaven.app

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  // Held for the app's lifetime so mdns-sd can receive multicast peer-discovery
  // packets. Android drops multicast to the app unless a MulticastLock is held;
  // without it, peer discovery silently finds nothing (only direct TCP works).
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    pluginManager.load(null, "biometric", BiometricPlugin(this), "{}")
    pluginManager.load(null, "wear", WearPlugin(this), "{}")
    pluginManager.load(null, "opener", OpenerPlugin(this), "{}")
    pluginManager.load(null, "securekey", SecureKeyPlugin(this), "{}")
    acquireMulticastLock()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
