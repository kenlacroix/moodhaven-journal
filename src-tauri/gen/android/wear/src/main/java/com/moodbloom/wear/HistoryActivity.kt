package com.moodbloom.wear

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.wear.widget.WearableLinearLayoutManager
import androidx.wear.widget.WearableRecyclerView

/**
 * HistoryActivity — shows the last [MoodHistory.MAX] mood taps logged from this watch.
 * Launched from MainActivity's history button.
 */
class HistoryActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)

        val entries   = MoodHistory.load(this)
        val emptyText = findViewById<TextView>(R.id.emptyText)
        val list      = findViewById<WearableRecyclerView>(R.id.historyList)

        if (entries.isEmpty()) {
            emptyText.visibility = View.VISIBLE
            list.visibility = View.GONE
        } else {
            emptyText.visibility = View.GONE
            list.isEdgeItemsCenteringEnabled = true
            list.layoutManager = WearableLinearLayoutManager(this)
            list.adapter = MoodHistoryAdapter(entries)
        }

        findViewById<View>(R.id.backBtn).setOnClickListener { finish() }
    }
}
