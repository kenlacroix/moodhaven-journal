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
    private val onMoodClick: (MoodItem) -> Unit,
) : RecyclerView.Adapter<MoodAdapter.MoodViewHolder>() {

    inner class MoodViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val colorPill: View     = itemView.findViewById(R.id.colorPill)
        val moodEmoji: TextView = itemView.findViewById(R.id.moodEmoji)
        val moodLabel: TextView = itemView.findViewById(R.id.moodLabel)
        val moodLevel: TextView = itemView.findViewById(R.id.moodLevel)
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
        holder.moodLevel.text = "${mood.level}"

        val color = try { Color.parseColor(mood.colorHex) } catch (_: IllegalArgumentException) { Color.GRAY }

        // Pill: mood color at 35% opacity so content stays readable, full radius
        val density = holder.itemView.context.resources.displayMetrics.density
        val drawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = 36f * density
            setColor(color)
            alpha = 90   // ~35% of 255
        }
        holder.colorPill.background = drawable

        // Level number tinted to mood color
        holder.moodLevel.setTextColor(color)

        holder.itemView.setOnClickListener { onMoodClick(mood) }
    }

    override fun getItemCount(): Int = moods.size
}
