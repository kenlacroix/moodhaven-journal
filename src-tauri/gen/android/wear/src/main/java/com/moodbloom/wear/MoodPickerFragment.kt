package com.moodbloom.wear

import android.graphics.Color
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
 * MoodPickerFragment — page 2.
 *
 * Phase 2 additions:
 *  • Ambient background colour shifts to focused mood colour (15% opacity)
 *  • "How are you?" label fades on first scroll, resets on resume
 *  • Last-sent mood shows ✓ badge in the wheel
 */
class MoodPickerFragment : Fragment() {

    interface Callback {
        fun onMoodSelected(mood: MoodItem)
    }

    private lateinit var moodList:        WearableRecyclerView
    private lateinit var ambientTint:     View
    private lateinit var howAreYouLabel:  TextView
    private lateinit var queuedBadge:     TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_mood_picker, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        moodList       = view.findViewById(R.id.moodList)
        ambientTint    = view.findViewById(R.id.ambientTint)
        howAreYouLabel = view.findViewById(R.id.howAreYouLabel)
        queuedBadge    = view.findViewById(R.id.queuedBadge)

        val lm = WearableLinearLayoutManager(requireContext(), WheelLayoutCallback())
        moodList.layoutManager                 = lm
        moodList.isEdgeItemsCenteringEnabled   = true
        moodList.isCircularScrollingGestureEnabled = true
        moodList.requestFocus()

        val lastSentLevel = MoodHistory.load(requireContext()).firstOrNull()?.mood?.level ?: -1
        moodList.adapter = MoodAdapter(MOODS, lastSentLevel) { mood ->
            (activity as? Callback)?.onMoodSelected(mood)
        }

        // Set initial ambient tint (center item = Okay, index 2)
        applyAmbientTint(MOODS[2].colorHex)

        // Scroll listener: ambient tint + title fade
        moodList.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            private var hasScrolled = false

            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                if (dy != 0 && !hasScrolled) {
                    hasScrolled = true
                    howAreYouLabel.animate().alpha(0f).setDuration(200).start()
                }
                updateAmbientTint(recyclerView)
            }
        })

        updateBadge()
    }

    override fun onResume() {
        super.onResume()
        howAreYouLabel.alpha = 1f
        updateBadge()
        // Refresh last-sent badge
        val lastSentLevel = MoodHistory.load(requireContext()).firstOrNull()?.mood?.level ?: -1
        (moodList.adapter as? MoodAdapter)?.updateLastSentLevel(lastSentLevel)
    }

    private fun updateAmbientTint(rv: RecyclerView) {
        val centerY = rv.height / 2f
        var closestPos  = -1
        var closestDist = Float.MAX_VALUE
        for (i in 0 until rv.childCount) {
            val child  = rv.getChildAt(i)
            val childCY = (child.top + child.bottom) / 2f
            val dist    = abs(childCY - centerY)
            if (dist < closestDist) {
                closestDist = dist
                closestPos  = rv.getChildAdapterPosition(child)
            }
        }
        if (closestPos in MOODS.indices) applyAmbientTint(MOODS[closestPos].colorHex)
    }

    private fun applyAmbientTint(colorHex: String) {
        try {
            val base = Color.parseColor(colorHex)
            val r = (Color.red(base)   * 0.15f).toInt()
            val g = (Color.green(base) * 0.15f).toInt()
            val b = (Color.blue(base)  * 0.15f).toInt()
            ambientTint.setBackgroundColor(Color.rgb(r, g, b))
        } catch (_: Exception) { }
    }

    private fun updateBadge() {
        val count = OfflineQueue.size(requireContext())
        queuedBadge.visibility = if (count > 0) View.VISIBLE else View.GONE
        if (count > 0) queuedBadge.text = "● $count"
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
}
