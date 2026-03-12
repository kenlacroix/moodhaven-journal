package com.moodbloom.wear

/**
 * BreathingMode — shared across BreatheFragment, BreatheModeDetailActivity,
 * BreatheSessionActivity, and BreatheSummaryActivity.
 *
 * @param pattern  [inhale, hold1, exhale, hold2] in seconds; 0 = phase skipped.
 */
data class BreathingMode(
    val id: String,
    val emoji: String,
    val name: String,
    val tagline: String,
    val description: String,
    val colorHex: String,
    /** [inhale, hold1, exhale, hold2] seconds; 0 = phase skipped */
    val pattern: IntArray,
    val defaultCycles: Int,
) {
    val cycleDurationSec: Int get() = pattern.sum()

    fun approxTimeLabel(cycles: Int): String {
        val totalSec = cycleDurationSec * cycles
        val mins = totalSec / 60
        val secs = totalSec % 60
        return if (secs == 0) "~$mins min" else "~$mins min ${secs}s"
    }

    /** "4 · 7 · 8" — skips zero-length phases */
    fun patternLabel(): String = pattern.filter { it > 0 }.joinToString(" · ")

    companion object {
        val ALL = listOf(
            BreathingMode(
                "unwind", "🌙", "Unwind", "Prepare for sleep",
                "Slow 4-7-8 breathing signals the nervous system to wind down.",
                "#6366F1", intArrayOf(4, 7, 8, 0), defaultCycles = 4,
            ),
            BreathingMode(
                "restore", "🌿", "Restore", "Deep recovery",
                "Extended exhale triggers the parasympathetic relaxation response.",
                "#10B981", intArrayOf(4, 0, 7, 0), defaultCycles = 10,
            ),
            BreathingMode(
                "relax", "😌", "Relax", "Ease anxiety",
                "Longer exhale activates the body's calming response.",
                "#8B5CF6", intArrayOf(4, 1, 6, 0), defaultCycles = 12,
            ),
            BreathingMode(
                "balance", "⚖️", "Balance", "Reset & refocus",
                "Equal-time box breathing clears mental fog and resets focus.",
                "#3B82F6", intArrayOf(4, 4, 4, 4), defaultCycles = 8,
            ),
            BreathingMode(
                "focus", "🎯", "Focus", "Mental clarity",
                "Crisp 4-2-4 rhythm primes attention without over-activating.",
                "#F59E0B", intArrayOf(4, 2, 4, 0), defaultCycles = 12,
            ),
            BreathingMode(
                "energize", "⚡", "Energize", "Beat the slump",
                "Short fast cycles boost alertness and circulation.",
                "#EF4444", intArrayOf(3, 0, 2, 0), defaultCycles = 18,
            ),
        )

        fun byId(id: String): BreathingMode = ALL.find { it.id == id } ?: ALL[3]

        /**
         * Suggest a mode based on resting HR.
         * Returns null if no suggestion is warranted.
         */
        fun suggest(hr: Int, hourOfDay: Int): BreathingMode? = when {
            hr > 90                               -> byId("relax")
            hr in 80..90 && hourOfDay >= 19       -> byId("unwind")
            hr < 60      && hourOfDay in 10..15   -> byId("energize")
            else                                  -> null
        }
    }

    // Generated equals/hashCode ignore pattern array identity
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is BreathingMode) return false
        return id == other.id
    }
    override fun hashCode(): Int = id.hashCode()
}
