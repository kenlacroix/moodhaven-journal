package com.moodbloom.wear

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
 * MoodPickerFragment — the default center page.
 *
 * Shows the 5-mood WearableRecyclerView with a curved wheel effect:
 * items near the top/bottom edges scale down and fade out, making the
 * focused center item feel like a physical scroll wheel.
 *
 * Circular scrolling gesture is enabled so users can also scroll by
 * tracing a circle on the screen (matches the round watch face).
 */
class MoodPickerFragment : Fragment() {

    interface Callback {
        fun onMoodSelected(mood: MoodItem)
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_mood_picker, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val moodList    = view.findViewById<WearableRecyclerView>(R.id.moodList)
        val queuedBadge = view.findViewById<TextView>(R.id.queuedBadge)

        // Wheel / drum-roll curve effect
        val layoutManager = WearableLinearLayoutManager(requireContext(), WheelLayoutCallback())
        moodList.layoutManager = layoutManager
        moodList.isEdgeItemsCenteringEnabled = true
        moodList.isCircularScrollingGestureEnabled = true   // swipe in a circle to scroll
        moodList.requestFocus()  // receive rotary input (crown/bezel)

        moodList.adapter = MoodAdapter(MOODS) { mood ->
            (activity as? Callback)?.onMoodSelected(mood)
        }

        updateBadge(queuedBadge)
    }

    override fun onResume() {
        super.onResume()
        view?.findViewById<TextView>(R.id.queuedBadge)?.let { updateBadge(it) }
    }

    private fun updateBadge(badge: TextView) {
        val count = OfflineQueue.size(requireContext())
        badge.visibility = if (count > 0) View.VISIBLE else View.GONE
        if (count > 0) badge.text = "● $count queued"
    }

    // ── Wheel curve ──────────────────────────────────────────────────────────

    /**
     * Scales and fades items that are away from the center of the list,
     * creating a drum-roll / scroll-wheel illusion on round watch faces.
     */
    private class WheelLayoutCallback : WearableLinearLayoutManager.LayoutCallback() {

        companion object {
            private const val MAX_ICON_PROGRESS = 1.0f
        }

        override fun onLayoutFinished(child: View, parent: RecyclerView) {
            val childCenterY = (child.top + child.bottom) / 2.0f
            val parentCenterY = parent.height / 2.0f

            // Fraction 0.0 = at center, 1.0 = at edge
            val fraction = (abs(childCenterY - parentCenterY) / parentCenterY)
                .coerceIn(0f, MAX_ICON_PROGRESS)

            // Scale: center = 1.0, edge = 0.75
            val scale = 1.0f - 0.25f * fraction
            child.scaleX = scale
            child.scaleY = scale

            // Alpha: center = 1.0, edge = 0.4
            child.alpha = 1.0f - 0.6f * fraction
        }
    }
}
