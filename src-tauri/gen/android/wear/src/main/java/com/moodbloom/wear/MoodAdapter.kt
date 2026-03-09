package com.moodbloom.wear

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * RecyclerView adapter that renders the 5-mood list inside WearableRecyclerView.
 *
 * Each row shows a coloured left-strip indicator, an emoji, and the mood label.
 * Tapping a row invokes [onMoodClick] with the selected [MoodItem].
 */
class MoodAdapter(
    private val moods: List<MoodItem>,
    private val onMoodClick: (MoodItem) -> Unit,
) : RecyclerView.Adapter<MoodAdapter.MoodViewHolder>() {

    inner class MoodViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val colorBar: View     = itemView.findViewById(R.id.colorBar)
        val moodEmoji: TextView = itemView.findViewById(R.id.moodEmoji)
        val moodLabel: TextView = itemView.findViewById(R.id.moodLabel)
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

        try {
            holder.colorBar.setBackgroundColor(Color.parseColor(mood.colorHex))
        } catch (_: IllegalArgumentException) {
            holder.colorBar.setBackgroundColor(Color.GRAY)
        }

        holder.itemView.setOnClickListener { onMoodClick(mood) }
    }

    override fun getItemCount(): Int = moods.size
}
