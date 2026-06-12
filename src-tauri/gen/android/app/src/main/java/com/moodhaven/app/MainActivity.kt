package com.moodhaven.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    pluginManager.load(null, "biometric", BiometricPlugin(this), "{}")
    pluginManager.load(null, "wear", WearPlugin(this), "{}")
    pluginManager.load(null, "securekey", SecureKeyPlugin(this), "{}")
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
