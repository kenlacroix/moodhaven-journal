package com.moodbloom.wear

import android.content.Intent
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
import java.util.Calendar
import kotlin.math.abs

/**
 * BreatheFragment — page 4 (rightmost).
 *
 * Displays a scrollable drum-roll wheel of 6 breathing modes.
 * Tapping a mode opens BreatheModeDetailActivity (Phase 3).
 * Shows an HR-based suggestion chip when a recent reading is available (Phase 3).
 */
class BreatheFragment : Fragment() {

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
        modeList.isEdgeItemsCenteringEnabled      = true
        modeList.isCircularScrollingGestureEnabled = false
        modeList.requestFocus()

        modeList.adapter = BreatheModeAdapter(BreathingMode.ALL) { mode ->
            val intent = Intent(requireContext(), BreatheModeDetailActivity::class.java)
                .putExtra(BreatheModeDetailActivity.EXTRA_MODE_ID, mode.id)
            startActivity(intent)
        }

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

        // Initial ambient tint for center item (Balance = index 3)
        applyTint(ambientTint, BreathingMode.ALL[3].colorHex)
    }

    override fun onResume() {
        super.onResume()
        view?.let { updateSuggestionChip(it) }
    }

    // ── HR suggestion chip ────────────────────────────────────────────────────

    private fun updateSuggestionChip(root: View) {
        val chipView  = root.findViewById<TextView>(R.id.breatheSuggestionChip) ?: return
        val lastHr    = HealthSnapshot.lastHr
        val timestamp = HealthSnapshot.lastHrTimestamp
        val ageMs     = if (timestamp != null) System.currentTimeMillis() - timestamp else Long.MAX_VALUE

        // Hide chip if no reading or reading is older than 30 minutes
        if (lastHr == null || ageMs > 30 * 60 * 1000L) {
            chipView.visibility = View.GONE
            return
        }
        val hour      = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val suggested = BreathingMode.suggest(lastHr, hour)
        if (suggested == null) {
            chipView.visibility = View.GONE
            return
        }
        chipView.visibility = View.VISIBLE
        chipView.text       = "💛 HR $lastHr · Try ${suggested.emoji} ${suggested.name}"
        chipView.setOnClickListener {
            val intent = Intent(requireContext(), BreatheModeDetailActivity::class.java)
                .putExtra(BreatheModeDetailActivity.EXTRA_MODE_ID, suggested.id)
            startActivity(intent)
        }
    }

    // ── Ambient tint ──────────────────────────────────────────────────────────

    private fun updateAmbientTint(rv: RecyclerView, tintView: View) {
        val centerY = rv.height / 2f
        var closestPos = -1
        var closestDist = Float.MAX_VALUE
        for (i in 0 until rv.childCount) {
            val child  = rv.getChildAt(i)
            val childCY = (child.top + child.bottom) / 2f
            val dist    = abs(childCY - centerY)
            if (dist < closestDist) { closestDist = dist; closestPos = rv.getChildAdapterPosition(child) }
        }
        if (closestPos in BreathingMode.ALL.indices) applyTint(tintView, BreathingMode.ALL[closestPos].colorHex)
    }

    private fun applyTint(tintView: View, colorHex: String) {
        try {
            val base = Color.parseColor(colorHex)
            val r = (Color.red(base)   * 0.15f).toInt()
            val g = (Color.green(base) * 0.15f).toInt()
            val b = (Color.blue(base)  * 0.15f).toInt()
            tintView.setBackgroundColor(Color.rgb(r, g, b))
        } catch (_: Exception) {}
    }

    // ── Wheel layout callback ─────────────────────────────────────────────────

    private class WheelLayoutCallback : WearableLinearLayoutManager.LayoutCallback() {
        override fun onLayoutFinished(child: View, parent: RecyclerView) {
            val childCY  = (child.top + child.bottom) / 2f
            val parentCY = parent.height / 2f
            val frac     = (abs(childCY - parentCY) / parentCY).coerceIn(0f, 1f)
            child.scaleX = 1f - 0.25f * frac
            child.scaleY = child.scaleX
            child.alpha  = 1f - 0.6f  * frac
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
