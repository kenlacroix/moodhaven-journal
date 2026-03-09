package com.moodbloom.wear

import android.graphics.Color
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
        val colorBar: View      = itemView.findViewById(R.id.colorBar)
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
        holder.colorBar.setBackgroundColor(color)
        holder.moodLevel.setTextColor(color)

        holder.itemView.setOnClickListener { onMoodClick(mood) }
    }

    override fun getItemCount(): Int = moods.size
}
