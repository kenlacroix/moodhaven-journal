package com.moodbloom.wear

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.wear.widget.WearableLinearLayoutManager
import androidx.wear.widget.WearableRecyclerView

/**
 * HistoryFragment — leftmost swipe page (page 0).
 * Shows the last [MoodHistory.MAX] mood taps logged from this watch.
 */
class HistoryFragment : Fragment() {

    private var list: WearableRecyclerView? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_history, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        list = view.findViewById(R.id.historyList)
        refreshList(view)
    }

    override fun onResume() {
        super.onResume()
        view?.let { refreshList(it) }
    }

    private fun refreshList(view: View) {
        val entries   = MoodHistory.load(requireContext())
        val emptyText = view.findViewById<TextView>(R.id.emptyText)
        val listView  = view.findViewById<WearableRecyclerView>(R.id.historyList)

        if (entries.isEmpty()) {
            emptyText.visibility = View.VISIBLE
            listView.visibility  = View.GONE
            return
        }

        emptyText.visibility = View.GONE
        listView.isEdgeItemsCenteringEnabled = true
        listView.layoutManager = WearableLinearLayoutManager(requireContext())
        listView.adapter = MoodHistoryAdapter(entries)
    }
}
