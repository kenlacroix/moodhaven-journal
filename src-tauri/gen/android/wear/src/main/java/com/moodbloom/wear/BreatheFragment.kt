package com.moodbloom.wear

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.RecyclerView
import androidx.wear.widget.WearableLinearLayoutManager
import androidx.wear.widget.WearableRecyclerView
import kotlin.math.abs

/**
 * BreatheFragment — page 4 (rightmost).
 *
 * Displays a scrollable drum-roll wheel of 6 breathing modes.
 * Phase 2: layout + visual polish complete.
 * Phase 3: tapping a mode opens BreatheModeDetailActivity.
 */
class BreatheFragment : Fragment() {

    // ── Breathing mode definitions ────────────────────────────────────────────

    data class BreathingMode(
        val emoji: String,
        val name: String,
        val tagline: String,
        val colorHex: String,
        /** seconds: inhale, hold1, exhale, hold2 */
        val pattern: IntArray,
        val defaultCycles: Int,
    )

    companion object {
        val MODES = listOf(
            BreathingMode("🌙", "Unwind",   "Prepare for sleep",    "#6366F1", intArrayOf(4, 7, 8, 0), 4),
            BreathingMode("🌿", "Restore",  "Deep recovery",        "#10B981", intArrayOf(4, 0, 7, 0), 10),
            BreathingMode("😌", "Relax",    "Ease anxiety",         "#8B5CF6", intArrayOf(4, 1, 6, 0), 12),
            BreathingMode("⚖️", "Balance",  "Reset & refocus",      "#3B82F6", intArrayOf(4, 4, 4, 4), 8),
            BreathingMode("🎯", "Focus",    "Mental clarity",       "#F59E0B", intArrayOf(4, 2, 4, 0), 12),
            BreathingMode("⚡", "Energize", "Beat the slump",       "#EF4444", intArrayOf(3, 0, 2, 0), 18),
        )
    }

    // ── Fragment lifecycle ────────────────────────────────────────────────────

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_breathe, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val modeList    = view.findViewById<WearableRecyclerView>(R.id.breatheModeList)
        val ambientTint = view.findViewById<View>(R.id.breatheAmbient)
        val title       = view.findViewById<TextView>(R.id.breatheTitle)

        val lm = WearableLinearLayoutManager(requireContext(), WheelLayoutCallback())
        modeList.layoutManager = lm
        modeList.isEdgeItemsCenteringEnabled = true
        modeList.isCircularScrollingGestureEnabled = true
        modeList.requestFocus()

        modeList.adapter = BreatheModeAdapter(MODES) { /* Phase 3: open detail screen */ }

        // Scroll listener: ambient tint + title fade
        modeList.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            private var hasScrolled = false

            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                if (dy != 0 && !hasScrolled) {
                    hasScrolled = true
                    title.animate().alpha(0f).setDuration(200).start()
                }
                updateAmbientTint(recyclerView, ambientTint)
            }
        })

        // Set initial ambient tint to the center item (index 3 = Balance)
        post(ambientTint, MODES[3].colorHex)
    }

    private fun updateAmbientTint(rv: RecyclerView, tintView: View) {
        val centerY = rv.height / 2f
        var closestPos = -1
        var closestDist = Float.MAX_VALUE
        for (i in 0 until rv.childCount) {
            val child = rv.getChildAt(i)
            val childCY = (child.top + child.bottom) / 2f
            val dist = abs(childCY - centerY)
            if (dist < closestDist) {
                closestDist = dist
                closestPos = rv.getChildAdapterPosition(child)
            }
        }
        if (closestPos in MODES.indices) post(tintView, MODES[closestPos].colorHex)
    }

    private fun post(tintView: View, colorHex: String) {
        try {
            val base = Color.parseColor(colorHex)
            val r = (Color.red(base)   * 0.15f).toInt()
            val g = (Color.green(base) * 0.15f).toInt()
            val b = (Color.blue(base)  * 0.15f).toInt()
            tintView.setBackgroundColor(Color.rgb(r, g, b))
        } catch (_: Exception) { }
    }

    // ── Wheel layout callback ─────────────────────────────────────────────────

    private class WheelLayoutCallback : WearableLinearLayoutManager.LayoutCallback() {
        override fun onLayoutFinished(child: View, parent: RecyclerView) {
            val childCY  = (child.top + child.bottom) / 2f
            val parentCY = parent.height / 2f
            val frac = (abs(childCY - parentCY) / parentCY).coerceIn(0f, 1f)
            child.scaleX = 1f - 0.25f * frac
            child.scaleY = child.scaleX
            child.alpha  = 1f - 0.6f * frac
        }
    }

    // ── Adapter ───────────────────────────────────────────────────────────────

    private class BreatheModeAdapter(
        private val modes: List<BreathingMode>,
        private val onModeClick: (BreathingMode) -> Unit,
    ) : RecyclerView.Adapter<BreatheModeAdapter.VH>() {

        inner class VH(v: View) : RecyclerView.ViewHolder(v) {
            val pill:    View     = v.findViewById(R.id.modePill)
            val emoji:   TextView = v.findViewById(R.id.modeEmoji)
            val name:    TextView = v.findViewById(R.id.modeName)
            val tagline: TextView = v.findViewById(R.id.modeTagline)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            VH(LayoutInflater.from(parent.context).inflate(R.layout.item_breathe_mode, parent, false))

        override fun onBindViewHolder(holder: VH, position: Int) {
            val mode  = modes[position]
            val color = try { Color.parseColor(mode.colorHex) } catch (_: Exception) { Color.GRAY }

            holder.emoji.text   = mode.emoji
            holder.name.text    = mode.name
            holder.tagline.text = mode.tagline

            val density  = holder.itemView.context.resources.displayMetrics.density
            val drawable = GradientDrawable().apply {
                shape        = GradientDrawable.RECTANGLE
                cornerRadius = 36f * density
                setColor(color)
                alpha = 80
            }
            holder.pill.background = drawable

            holder.itemView.setOnClickListener { onModeClick(mode) }
        }

        override fun getItemCount() = modes.size
    }
}
