package com.moodhaven.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    getPluginManager().load(null, "biometric", BiometricPlugin(this), "{}")
    getPluginManager().load(null, "wear", WearPlugin(this), "{}")
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
