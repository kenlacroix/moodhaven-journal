package com.moodbloom.wear

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.recyclerview.widget.RecyclerView
import androidx.wear.widget.WearableLinearLayoutManager
import androidx.wear.widget.WearableRecyclerView

/**
 * HistoryActivity — shows the last [MoodHistory.MAX] mood taps logged from this watch.
 * Launched from MainActivity's 📋 history button.
 */
class HistoryActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)

        val entries = MoodHistory.load(this)

        val emptyText = findViewById<TextView>(R.id.emptyText)
        val list      = findViewById<WearableRecyclerView>(R.id.historyList)

        if (entries.isEmpty()) {
            emptyText.visibility = View.VISIBLE
            list.visibility = View.GONE
        } else {
            emptyText.visibility = View.GONE
            list.isEdgeItemsCenteringEnabled = true
            list.layoutManager = WearableLinearLayoutManager(this)
            list.adapter = HistoryAdapter(entries)
        }

        findViewById<View>(R.id.backBtn).setOnClickListener { finish() }
    }

    // ── Adapter ───────────────────────────────────────────────────────────────

    private class HistoryAdapter(
        private val entries: List<MoodHistory.Entry>,
    ) : RecyclerView.Adapter<HistoryAdapter.VH>() {

        inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
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
}
