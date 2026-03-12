package com.moodbloom.wear

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * ArcProgressView — circular arc drawn around the record button showing
 * elapsed recording time as a fraction of MAX_DURATION_MS.
 *
 * Arc starts at the top (270°) and sweeps clockwise.
 * Colours:
 *   0 – 80%  violet  #C4B5FD
 *   80 – 95% amber   #FBBF24
 *   95 – 100% red    #EF4444
 */
class ArcProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    /** 0.0 = empty, 1.0 = full. Setting this calls invalidate(). */
    var progress: Float = 0f
        set(value) {
            field = value.coerceIn(0f, 1f)
            invalidate()
        }

    private val dp = resources.displayMetrics.density

    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style       = Paint.Style.STROKE
        strokeWidth = 2.5f * dp
        strokeCap   = Paint.Cap.ROUND
        color       = Color.parseColor("#1AFFFFFF")
    }

    private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style       = Paint.Style.STROKE
        strokeWidth = 2.5f * dp
        strokeCap   = Paint.Cap.ROUND
    }

    private val oval = RectF()

    override fun onDraw(canvas: Canvas) {
        if (progress <= 0f) return

        val cx = width / 2f
        val cy = height / 2f
        val r  = minOf(cx, cy) - 1.5f * dp   // just inside the view edge

        oval.set(cx - r, cy - r, cx + r, cy + r)

        // Faint full-circle track
        canvas.drawArc(oval, -90f, 360f, false, trackPaint)

        // Coloured progress arc
        arcPaint.color = when {
            progress >= 0.95f -> Color.parseColor("#EF4444")
            progress >= 0.80f -> Color.parseColor("#FBBF24")
            else              -> Color.parseColor("#C4B5FD")
        }
        canvas.drawArc(oval, -90f, 360f * progress, false, arcPaint)
    }
}
