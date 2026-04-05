package com.moodhaven.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    pluginManager.load(null, "biometric", BiometricPlugin(this), "{}")
    pluginManager.load(null, "wear", WearPlugin(this), "{}")
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
