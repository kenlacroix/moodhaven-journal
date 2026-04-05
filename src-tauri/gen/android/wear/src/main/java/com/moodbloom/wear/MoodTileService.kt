package com.moodbloom.wear

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.Layout
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.VERTICAL_ALIGN_CENTER
import androidx.wear.protolayout.ModifiersBuilders.Background
import androidx.wear.protolayout.ModifiersBuilders.Clickable
import androidx.wear.protolayout.ModifiersBuilders.Corner
import androidx.wear.protolayout.ModifiersBuilders.Modifiers
import androidx.wear.protolayout.ModifiersBuilders.Padding
import androidx.wear.protolayout.ResourceBuilders.Resources
import androidx.wear.protolayout.TimelineBuilders.Timeline
import androidx.wear.protolayout.TimelineBuilders.TimelineEntry
import androidx.wear.tiles.RequestBuilders.ResourcesRequest
import androidx.wear.tiles.RequestBuilders.TileRequest
import androidx.wear.tiles.TileBuilders.Tile
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * MoodTileService — Wear OS tile that lets users log mood without opening the app.
 *
 * Swipe right from the watch face to access this tile.
 * Shows 5 mood emoji buttons; tapping launches TileActionActivity which sends the
 * signal and shows a brief confirmation, then finishes.
 *
 * Add to watch face: Settings → Tiles → Add tile → MoodBloom Mood
 */
class MoodTileService : TileService() {

    override fun onTileRequest(requestParams: TileRequest): ListenableFuture<Tile> =
        Futures.immediateFuture(buildTile())

    override fun onTileResourcesRequest(requestParams: ResourcesRequest): ListenableFuture<Resources> =
        Futures.immediateFuture(
            Resources.Builder().setVersion("1").build()
        )

    // ── Layout ────────────────────────────────────────────────────────────────

    private fun buildTile(): Tile {
        return Tile.Builder()
            .setResourcesVersion("1")
            .setTileTimeline(
                Timeline.Builder()
                    .addTimelineEntry(
                        TimelineEntry.Builder()
                            .setLayout(buildLayout())
                            .build()
                    )
                    .build()
            )
            .build()
    }

    private fun buildLayout(): Layout {
        // Read last logged mood from local history to highlight it
        val lastMoodLevel = MoodHistory.load(this).firstOrNull()?.moodLevel

        val root = Column.Builder()
            .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)

        // Title
        root.addContent(
            Text.Builder()
                .setText("How do you feel?")
                .setFontStyle(
                    FontStyle.Builder()
                        .setSize(sp(13f))
                        .setColor(argb(0xAAFFFFFF.toInt()))
                        .build()
                )
                .build()
        )
        root.addContent(Spacer.Builder().setHeight(dp(8f)).build())

        // Mood buttons row (show 1→5 left to right)
        val row = Row.Builder().setVerticalAlignment(VERTICAL_ALIGN_CENTER)

        for (mood in MOODS.reversed()) {
            val isLast = lastMoodLevel == mood.level
            val bgAlpha = if (isLast) 0xCC else 0x33
            val bgColor = parseHexWithAlpha(mood.colorHex, bgAlpha)

            row.addContent(
                Box.Builder()
                    .setWidth(dp(40f))
                    .setHeight(dp(40f))
                    .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
                    .setVerticalAlignment(VERTICAL_ALIGN_CENTER)
                    .setModifiers(
                        Modifiers.Builder()
                            .setBackground(
                                Background.Builder()
                                    .setColor(argb(bgColor))
                                    .setCorner(Corner.Builder().setRadius(dp(20f)).build())
                                    .build()
                            )
                            .setPadding(Padding.Builder().setAll(dp(2f)).build())
                            .setClickable(
                                Clickable.Builder()
                                    .setId("mood_${mood.level}")
                                    .setOnClick(
                                        ActionBuilders.LaunchAction.Builder()
                                            .setAndroidActivity(
                                                ActionBuilders.AndroidActivity.Builder()
                                                    .setPackageName(BuildConfig.APPLICATION_ID)
                                                    .setClassName("com.moodbloom.wear.TileActionActivity")
                                                    .addKeyToExtraMapping(
                                                        "mood_level",
                                                        ActionBuilders.AndroidStringExtra.Builder()
                                                            .setValue(mood.level.toString())
                                                            .build()
                                                    )
                                                    .build()
                                            )
                                            .build()
                                    )
                                    .build()
                            )
                            .build()
                    )
                    .addContent(
                        Text.Builder()
                            .setText(mood.emoji)
                            .setFontStyle(FontStyle.Builder().setSize(sp(20f)).build())
                            .build()
                    )
                    .build()
            )
            if (mood.level > 1) {
                row.addContent(Spacer.Builder().setWidth(dp(4f)).build())
            }
        }
        root.addContent(row.build())

        // Pending queue indicator
        val queueSize = OfflineQueue.size(this)
        if (queueSize > 0) {
            root.addContent(Spacer.Builder().setHeight(dp(6f)).build())
            root.addContent(
                Text.Builder()
                    .setText("$queueSize pending sync")
                    .setFontStyle(
                        FontStyle.Builder()
                            .setSize(sp(10f))
                            .setColor(argb(0xFFF97316.toInt()))
                            .build()
                    )
                    .build()
            )
        }

        return Layout.Builder().setRoot(root.build()).build()
    }

    /** Parse "#RRGGBB" and combine with an alpha byte into an ARGB int. */
    private fun parseHexWithAlpha(hex: String, alpha: Int): Int = try {
        val rgb = hex.trimStart('#').toLong(16).toInt()
        (alpha shl 24) or (rgb and 0x00FFFFFF)
    } catch (_: Exception) { 0x33FFFFFF }
}
