package com.moodbloom.wear

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class MoodAdapter(
    private val moods: List<MoodItem>,
    private var lastSentLevel: Int = -1,
    private val onMoodClick: (MoodItem) -> Unit,
) : RecyclerView.Adapter<MoodAdapter.MoodViewHolder>() {

    inner class MoodViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val colorPill: View     = itemView.findViewById(R.id.colorPill)
        val moodEmoji: TextView = itemView.findViewById(R.id.moodEmoji)
        val moodLabel: TextView = itemView.findViewById(R.id.moodLabel)
        val moodLevel: TextView = itemView.findViewById(R.id.moodLevel)
    }

    /** Called from MoodPickerFragment.onResume() after a new mood is sent. */
    fun updateLastSentLevel(level: Int) {
        val old = lastSentLevel
        lastSentLevel = level
        if (old != level) notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MoodViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_mood, parent, false)
        return MoodViewHolder(view)
    }

    override fun onBindViewHolder(holder: MoodViewHolder, position: Int) {
        val mood = moods[position]
        holder.moodEmoji.text = mood.emoji
        holder.moodLabel.text = mood.label

        val color = try { Color.parseColor(mood.colorHex) } catch (_: IllegalArgumentException) { Color.GRAY }

        // Reuse existing background drawable instead of allocating a new GradientDrawable per bind
        val pill = holder.colorPill.background as? GradientDrawable ?: run {
            val density = holder.itemView.context.resources.displayMetrics.density
            GradientDrawable().also {
                it.shape        = GradientDrawable.RECTANGLE
                it.cornerRadius = 36f * density
                it.alpha        = 90
                holder.colorPill.background = it
            }
        }
        pill.setColor(color)

        // ✓ badge if this is the last sent mood; otherwise level number
        if (mood.level == lastSentLevel) {
            holder.moodLevel.text      = "✓"
            holder.moodLevel.textSize  = 14f
            holder.moodLevel.setTextColor(color)
        } else {
            holder.moodLevel.text      = "${mood.level}"
            holder.moodLevel.textSize  = 12f
            holder.moodLevel.setTextColor(color)
        }

        holder.itemView.setOnClickListener { onMoodClick(mood) }
    }

    override fun getItemCount(): Int = moods.size
}
