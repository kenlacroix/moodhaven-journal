package com.moodbloom.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ── Mood model ────────────────────────────────────────────────────────────────

data class Mood(
    val level: Int,       // 1–5 matching MoodBloom scale
    val emoji: String,
    val label: String,
    val color: Color,
)

val MOODS = listOf(
    Mood(5, "😊", "Great",   Color(0xFF10B981)),
    Mood(4, "🙂", "Good",    Color(0xFF84CC16)),
    Mood(3, "😐", "Okay",    Color(0xFFEAB308)),
    Mood(2, "😔", "Low",     Color(0xFFF97316)),
    Mood(1, "😢", "Bad",     Color(0xFFEF4444)),
)

// ── Root composable ───────────────────────────────────────────────────────────

@Composable
fun MoodPickerApp(context: Context) {
    val scope = rememberCoroutineScope()

    // UI state
    var sending   by remember { mutableStateOf(false) }
    var confirmed by remember { mutableStateOf<Mood?>(null) }
    var failed    by remember { mutableStateOf(false) }

    // Auto-reset confirmation screen after 1.8 s
    LaunchedEffect(confirmed, failed) {
        if (confirmed != null || failed) {
            delay(1800)
            confirmed = null
            failed = false
        }
    }

    when {
        confirmed != null -> ConfirmationScreen(mood = confirmed!!)
        failed            -> ErrorScreen()
        else              -> MoodPickerScreen(
            sending = sending,
            onMoodSelected = { mood ->
                if (!sending) {
                    scope.launch {
                        sending = true
                        hapticTap(context)            // immediate local feedback
                        val ok = SignalSender.sendMoodTap(context, mood.level)
                        sending = false
                        if (ok) confirmed = mood else failed = true
                    }
                }
            },
        )
    }
}

// ── Mood picker ───────────────────────────────────────────────────────────────

@Composable
fun MoodPickerScreen(
    sending: Boolean,
    onMoodSelected: (Mood) -> Unit,
) {
    val listState = rememberScalingLazyListState()

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Text(
                    text = "How do you feel?",
                    style = MaterialTheme.typography.body2,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }

            items(MOODS.size) { i ->
                val mood = MOODS[i]
                MoodChip(
                    mood = mood,
                    enabled = !sending,
                    onClick = { onMoodSelected(mood) },
                )
            }

            if (sending) {
                item {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .padding(top = 8.dp)
                            .size(20.dp),
                        strokeWidth = 2.dp,
                    )
                }
            }
        }
    }
}

@Composable
private fun MoodChip(
    mood: Mood,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Chip(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        onClick = onClick,
        enabled = enabled,
        colors = ChipDefaults.chipColors(
            backgroundColor = mood.color.copy(alpha = 0.25f),
            disabledBackgroundColor = mood.color.copy(alpha = 0.10f),
        ),
        label = {
            Text(
                text = "${mood.emoji}  ${mood.label}",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
        },
    )
}

// ── Confirmation screens ──────────────────────────────────────────────────────

@Composable
fun ConfirmationScreen(mood: Mood) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colors.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(text = mood.emoji, fontSize = 44.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Logged",
                style = MaterialTheme.typography.title3,
                color = mood.color,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = mood.label,
                style = MaterialTheme.typography.body2,
                color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}

@Composable
fun ErrorScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "📵", fontSize = 36.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Phone not reachable",
                style = MaterialTheme.typography.body2,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f),
            )
        }
    }
}

// ── Haptic helpers ────────────────────────────────────────────────────────────

internal fun hapticTap(context: Context) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator.vibrate(
                VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
            )
        } else {
            @Suppress("DEPRECATION")
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    } catch (e: Exception) {
        Log.w("MoodBloomWear", "Haptic tap failed: ${e.message}")
    }
}
