package com.moodbloom.wear

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator

/**
 * BreatheRingView — full-screen animated circle ring for BreatheSessionActivity.
 *
 * Call [animateTo] to smoothly expand/contract between inhale (0.90) and
 * exhale (0.40) fractions of the view radius.
 */
class BreatheRingView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 10f * resources.displayMetrics.density
        color = Color.parseColor("#C4B5FD") // default violet
    }

    private var radiusFraction = 0.40f
    private var currentAnimator: ValueAnimator? = null

    fun setModeColor(hex: String) {
        paint.color = try { Color.parseColor(hex) } catch (_: Exception) { Color.parseColor("#C4B5FD") }
        invalidate()
    }

    /**
     * Animate the ring radius to [targetFraction] (0.0–1.0 of max radius)
     * over [durationMs] milliseconds.
     */
    fun animateTo(targetFraction: Float, durationMs: Long) {
        currentAnimator?.cancel()
        currentAnimator = ValueAnimator.ofFloat(radiusFraction, targetFraction).apply {
            duration = durationMs.coerceAtLeast(200)
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                radiusFraction = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    /** Immediately set fraction without animation (used to reset on session end). */
    fun setFraction(f: Float) {
        currentAnimator?.cancel()
        radiusFraction = f.coerceIn(0f, 1f)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val cx   = width  / 2f
        val cy   = height / 2f
        val maxR = minOf(cx, cy) * 0.88f
        canvas.drawCircle(cx, cy, maxR * radiusFraction, paint)
    }
}
