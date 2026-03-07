package com.moodbloom.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    registerPlugin(BiometricPlugin::class.java)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
