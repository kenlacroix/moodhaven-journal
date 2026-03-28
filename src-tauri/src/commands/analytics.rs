//! Analytics-related Tauri commands
//!
//! Commands for calendar view and analytics dashboard features.

use crate::db::{
    self, CalendarDayData, Database, DayOfWeekStats, FullAnalyticsBundle, InsightsMetadata,
    MoodDistribution, StreakStats,
};
use tauri::State;

/// Get mood distribution (count per mood level 1-5)
#[tauri::command]
pub fn get_mood_distribution(db: State<Database>) -> Result<Vec<MoodDistribution>, String> {
    db::get_mood_distribution(&db)
}

/// Get streak statistics (current and longest streaks)
#[tauri::command]
pub fn get_streak_stats(db: State<Database>) -> Result<StreakStats, String> {
    db::get_streak_stats(&db)
}

/// Get average mood by day of week
#[tauri::command]
pub fn get_day_of_week_stats(db: State<Database>) -> Result<Vec<DayOfWeekStats>, String> {
    db::get_day_of_week_stats(&db)
}

/// Get mood data for a specific month (for calendar view)
#[tauri::command]
pub fn get_monthly_mood_data(
    db: State<Database>,
    year: i32,
    month: i32,
) -> Result<Vec<CalendarDayData>, String> {
    // Validate month range
    if !(1..=12).contains(&month) {
        return Err("Month must be between 1 and 12".to_string());
    }

    db::get_monthly_mood_data(&db, year, month)
}

/// Get all analytics data in a single DB session (replaces 5 parallel IPC calls)
#[tauri::command]
pub fn get_full_analytics_bundle(
    db: State<Database>,
    trend_days: i64,
) -> Result<FullAnalyticsBundle, String> {
    db::get_full_analytics_bundle(&db, trend_days)
}

/// Get lightweight insights metadata (no decryption required)
#[tauri::command]
pub fn get_insights_metadata(db: State<Database>) -> Result<InsightsMetadata, String> {
    db::get_insights_metadata(&db)
}
