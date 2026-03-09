package com.moodbloom.wear

import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/**
 * MoodComplicationService — provides mood data to watch faces.
 *
 * Supports SHORT_TEXT and LONG_TEXT complication slots.
 *
 * SHORT_TEXT: emoji + mood label   e.g. "😊 Great"
 * LONG_TEXT:  last mood + time     e.g. "😊 Great · Today 09:14"
 *
 * Watch face users: long-press the watch face → Complications → choose a slot
 * → scroll to MoodBloom.
 */
class MoodComplicationService : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        val sample = MOODS.first()  // level 5 "Great" as preview
        return when (type) {
            ComplicationType.SHORT_TEXT -> shortText("${sample.emoji}", sample.label)
            ComplicationType.LONG_TEXT  -> longText("${sample.emoji} ${sample.label}", "Today 09:14")
            else -> null
        }
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val history = MoodHistory.load(this)
        val latest  = history.firstOrNull()

        return if (latest == null) {
            // No history yet — prompt user to log
            when (request.complicationType) {
                ComplicationType.SHORT_TEXT -> shortText("🌱", "Log mood")
                ComplicationType.LONG_TEXT  -> longText("🌱 Log your mood", "MoodBloom")
                else -> null
            }
        } else {
            val mood = latest.mood
            when (request.complicationType) {
                ComplicationType.SHORT_TEXT -> shortText(mood.emoji, mood.label)
                ComplicationType.LONG_TEXT  -> longText("${mood.emoji} ${mood.label}", latest.displayTime())
                else -> null
            }
        }
    }

    // ── Builders ──────────────────────────────────────────────────────────────

    private fun shortText(text: String, title: String): ShortTextComplicationData =
        ShortTextComplicationData.Builder(
            text  = PlainComplicationText.Builder(text).build(),
            contentDescription = PlainComplicationText.Builder("MoodBloom: $title").build(),
        )
            .setTitle(PlainComplicationText.Builder(title).build())
            .build()

    private fun longText(text: String, title: String): LongTextComplicationData =
        LongTextComplicationData.Builder(
            text  = PlainComplicationText.Builder(text).build(),
            contentDescription = PlainComplicationText.Builder("MoodBloom: $text").build(),
        )
            .setTitle(PlainComplicationText.Builder(title).build())
            .build()
}
