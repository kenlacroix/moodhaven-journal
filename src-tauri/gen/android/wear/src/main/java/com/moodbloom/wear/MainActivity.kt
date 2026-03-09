package com.moodbloom.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.wear.compose.material.MaterialTheme

/**
 * MoodBloom Watch — main entry point.
 *
 * Opens directly to the mood picker. No splash, no onboarding — the watch
 * experience is intentionally instant: open → tap mood → done.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                MoodPickerApp(context = this)
            }
        }
    }
}
