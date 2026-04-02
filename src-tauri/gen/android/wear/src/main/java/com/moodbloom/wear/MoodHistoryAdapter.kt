package com.moodbloom.wear

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * MoodHistoryAdapter — shared adapter for mood history lists.
 *
 * Used by both [HistoryActivity] (standalone screen) and [HistoryFragment] (page 0).
 * Extracted to eliminate duplicate adapter implementations.
 */
class MoodHistoryAdapter(
    private val entries: List<MoodHistory.Entry>,
) : RecyclerView.Adapter<MoodHistoryAdapter.VH>() {

    class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val dot:   View     = itemView.findViewById(R.id.historyDot)
        val emoji: TextView = itemView.findViewById(R.id.historyEmoji)
        val label: TextView = itemView.findViewById(R.id.historyLabel)
        val time:  TextView = itemView.findViewById(R.id.historyTime)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_history, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val entry = entries[position]
        val mood  = entry.mood
        val color = try { Color.parseColor(mood.colorHex) } catch (_: IllegalArgumentException) { Color.GRAY }

        holder.dot.background?.setTint(color)
        holder.emoji.text = mood.emoji
        holder.label.text = mood.label
        holder.time.text  = entry.displayTime()
    }

    override fun getItemCount(): Int = entries.size
}
