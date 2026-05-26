use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// Daily mood statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Mood distribution for analytics
#[derive(Debug, Serialize, Deserialize)]
pub struct MoodDistribution {
    pub mood: i32,
    pub count: i32,
}

/// Streak statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct StreakStats {
    pub current_streak: i32,
    pub longest_streak: i32,
    pub last_entry_date: Option<String>,
}

/// Day of week statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct DayOfWeekStats {
    pub day_of_week: i32,
    pub day_name: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Bundled analytics response — all analytics data in one DB session
#[derive(Debug, Serialize, Deserialize)]
pub struct FullAnalyticsBundle {
    pub average_mood: f64,
    pub total_entries: i32,
    pub streak_stats: StreakStats,
    pub mood_distribution: Vec<MoodDistribution>,
    pub day_of_week_stats: Vec<DayOfWeekStats>,
    pub trend_data: Vec<DailyStats>,
}

/// Insights metadata — lightweight all-time stats that don't require decryption
#[derive(Debug, Serialize, Deserialize)]
pub struct InsightsMetadata {
    pub entries_this_week: i32,
    pub total_entries: i32,
    pub top_tags: Vec<String>,
    pub last_entry_date: Option<String>,
}

/// Calendar day data for monthly view
#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarDayData {
    pub date: String,
    pub average_mood: f64,
    pub entry_count: i32,
}

/// Get mood statistics for a date range
pub fn get_mood_stats(
    db: &Database,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<DailyStats>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT date, average_mood, entry_count
             FROM mood_daily_stats
             WHERE date BETWEEN ?1 AND ?2
             ORDER BY date DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let stats = stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(stats)
}

/// Get overall statistics
pub fn get_overall_stats(db: &Database) -> Result<(f64, i32), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn
        .query_row(
            "SELECT COALESCE(AVG(mood), 0), COUNT(*) FROM journal_entries",
            [],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
        )
        .map_err(|e| format!("Query failed: {}", e))?;

    Ok(result)
}

/// Get mood distribution (count per mood level 1-5)
pub fn get_mood_distribution(db: &Database) -> Result<Vec<MoodDistribution>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT mood, COUNT(*) as count
             FROM journal_entries
             GROUP BY mood
             ORDER BY mood",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let distribution = stmt
        .query_map([], |row| {
            Ok(MoodDistribution {
                mood: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(distribution)
}

/// Get streak statistics (current and longest streaks)
pub fn get_streak_stats(db: &Database) -> Result<StreakStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date(created_at) as entry_date
             FROM journal_entries
             ORDER BY entry_date DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let dates: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    if dates.is_empty() {
        return Ok(StreakStats {
            current_streak: 0,
            longest_streak: 0,
            last_entry_date: None,
        });
    }

    let last_entry_date = dates.first().cloned();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut current_streak = 0;
    let mut check_date = chrono::Local::now().date_naive();

    if let Some(ref last_date) = last_entry_date {
        if last_date != &today {
            let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            if last_date != &yesterday {
                current_streak = 0;
            } else {
                check_date -= chrono::Duration::days(1);
            }
        }
    }

    if current_streak == 0
        && (last_entry_date.as_ref() == Some(&today)
            || last_entry_date.as_ref()
                == Some(
                    &(chrono::Local::now() - chrono::Duration::days(1))
                        .format("%Y-%m-%d")
                        .to_string(),
                ))
    {
        for date_str in &dates {
            let expected = check_date.format("%Y-%m-%d").to_string();
            if date_str == &expected {
                current_streak += 1;
                check_date -= chrono::Duration::days(1);
            } else {
                break;
            }
        }
    }

    let mut longest_streak = 0;
    let mut temp_streak = 1;

    for i in 0..dates.len() - 1 {
        let current = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d")
            .map_err(|e| format!("Date parse failed: {}", e))?;
        let next = chrono::NaiveDate::parse_from_str(&dates[i + 1], "%Y-%m-%d")
            .map_err(|e| format!("Date parse failed: {}", e))?;

        if (current - next).num_days() == 1 {
            temp_streak += 1;
        } else {
            longest_streak = longest_streak.max(temp_streak);
            temp_streak = 1;
        }
    }
    longest_streak = longest_streak.max(temp_streak);

    current_streak = current_streak.min(longest_streak);
    longest_streak = longest_streak.max(current_streak);

    Ok(StreakStats {
        current_streak,
        longest_streak,
        last_entry_date,
    })
}

/// Get average mood by day of week
pub fn get_day_of_week_stats(db: &Database) -> Result<Vec<DayOfWeekStats>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let day_names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    let mut stmt = conn
        .prepare(
            "SELECT
                CAST(strftime('%w', created_at) AS INTEGER) as dow,
                AVG(mood) as avg_mood,
                COUNT(*) as count
             FROM journal_entries
             GROUP BY dow
             ORDER BY dow",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let stats = stmt
        .query_map([], |row| {
            let dow: i32 = row.get(0)?;
            Ok(DayOfWeekStats {
                day_of_week: dow,
                day_name: day_names
                    .get(dow as usize)
                    .unwrap_or(&"Unknown")
                    .to_string(),
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(stats)
}

/// Get all analytics data in a single DB session (one mutex acquisition)
pub fn get_full_analytics_bundle(
    db: &Database,
    trend_days: i64,
) -> Result<FullAnalyticsBundle, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (average_mood, total_entries) = conn
        .query_row(
            "SELECT COALESCE(AVG(mood), 0), COUNT(*) FROM journal_entries",
            [],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
        )
        .map_err(|e| format!("Overall stats query failed: {}", e))?;

    let mut date_stmt = conn
        .prepare(
            "SELECT DISTINCT date(created_at) as entry_date
             FROM journal_entries
             ORDER BY entry_date DESC",
        )
        .map_err(|e| format!("Streak prepare failed: {}", e))?;

    let dates: Vec<String> = date_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Streak query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let streak_stats = compute_streak_stats(dates);

    let mut dist_stmt = conn
        .prepare("SELECT mood, COUNT(*) as count FROM journal_entries GROUP BY mood ORDER BY mood")
        .map_err(|e| format!("Distribution prepare failed: {}", e))?;

    let mood_distribution = dist_stmt
        .query_map([], |row| {
            Ok(MoodDistribution {
                mood: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Distribution query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Distribution row parsing failed: {}", e))?;

    let day_names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];
    let mut dow_stmt = conn
        .prepare(
            "SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow,
                    AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries GROUP BY dow ORDER BY dow",
        )
        .map_err(|e| format!("DOW prepare failed: {}", e))?;

    let day_of_week_stats = dow_stmt
        .query_map([], |row| {
            let dow: i32 = row.get(0)?;
            Ok(DayOfWeekStats {
                day_of_week: dow,
                day_name: day_names
                    .get(dow as usize)
                    .unwrap_or(&"Unknown")
                    .to_string(),
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("DOW query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DOW row parsing failed: {}", e))?;

    let mut trend_stmt = conn
        .prepare(
            "SELECT date(created_at) as date, AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries
             WHERE date(created_at) >= date('now', ?1)
             GROUP BY date(created_at)
             ORDER BY date",
        )
        .map_err(|e| format!("Trend prepare failed: {}", e))?;

    let trend_offset = format!("-{} days", trend_days);
    let trend_data = trend_stmt
        .query_map(params![trend_offset], |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Trend query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Trend row parsing failed: {}", e))?;

    Ok(FullAnalyticsBundle {
        average_mood,
        total_entries,
        streak_stats,
        mood_distribution,
        day_of_week_stats,
        trend_data,
    })
}

/// Get lightweight insights metadata (no decryption required)
pub fn get_insights_metadata(db: &Database) -> Result<InsightsMetadata, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_entries: i32 = conn
        .query_row("SELECT COUNT(*) FROM journal_entries", [], |row| row.get(0))
        .unwrap_or(0);

    let entries_this_week: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE date(created_at) >= date('now', 'weekday 0', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mut tag_stmt = conn
        .prepare(
            "SELECT t.name
             FROM entry_tags et
             JOIN tags t ON t.id = et.tag_id
             GROUP BY t.id
             ORDER BY COUNT(*) DESC
             LIMIT 5",
        )
        .map_err(|e| format!("Tag prepare failed: {}", e))?;

    let top_tags = tag_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Tag query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let last_entry_date: Option<String> = conn
        .query_row(
            "SELECT date(created_at) FROM journal_entries ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(InsightsMetadata {
        entries_this_week,
        total_entries,
        top_tags,
        last_entry_date,
    })
}

fn compute_streak_stats(dates: Vec<String>) -> StreakStats {
    if dates.is_empty() {
        return StreakStats {
            current_streak: 0,
            longest_streak: 0,
            last_entry_date: None,
        };
    }

    let last_entry_date = dates.first().cloned();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut current_streak = 0i32;
    let mut check_date = chrono::Local::now().date_naive();

    if let Some(ref last_date) = last_entry_date {
        if last_date != &today {
            let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            if last_date != &yesterday {
                current_streak = 0;
            } else {
                check_date -= chrono::Duration::days(1);
            }
        }
    }

    if current_streak == 0
        && (last_entry_date.as_ref() == Some(&today)
            || last_entry_date.as_ref()
                == Some(
                    &(chrono::Local::now() - chrono::Duration::days(1))
                        .format("%Y-%m-%d")
                        .to_string(),
                ))
    {
        for date_str in &dates {
            let expected = check_date.format("%Y-%m-%d").to_string();
            if date_str == &expected {
                current_streak += 1;
                check_date -= chrono::Duration::days(1);
            } else {
                break;
            }
        }
    }

    let mut longest_streak = 0i32;
    let mut temp_streak = 1i32;

    for i in 0..dates.len().saturating_sub(1) {
        let current = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d");
        let next = chrono::NaiveDate::parse_from_str(&dates[i + 1], "%Y-%m-%d");
        if let (Ok(c), Ok(n)) = (current, next) {
            if (c - n).num_days() == 1 {
                temp_streak += 1;
            } else {
                longest_streak = longest_streak.max(temp_streak);
                temp_streak = 1;
            }
        }
    }
    longest_streak = longest_streak.max(temp_streak);
    current_streak = current_streak.min(longest_streak);
    longest_streak = longest_streak.max(current_streak);

    StreakStats {
        current_streak,
        longest_streak,
        last_entry_date,
    }
}

/// Get mood data for a specific month (for calendar view)
pub fn get_monthly_mood_data(
    db: &Database,
    year: i32,
    month: i32,
) -> Result<Vec<CalendarDayData>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let days_in_month = days_in_month(year, month);
    let start = format!("{:04}-{:02}-01", year, month);
    let end = format!("{:04}-{:02}-{:02}", year, month, days_in_month);

    let mut stmt = conn
        .prepare(
            "SELECT date, average_mood, entry_count
             FROM mood_daily_stats
             WHERE date >= ?1 AND date <= ?2
             ORDER BY date",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let data = stmt
        .query_map(params![start, end], |row| {
            Ok(CalendarDayData {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    if !data.is_empty() {
        return Ok(data);
    }

    let entry_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE date(created_at) >= ?1 AND date(created_at) <= ?2",
            params![start, end],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if entry_count == 0 {
        return Ok(vec![]);
    }

    let year_str = format!("{:04}", year);
    let month_str = format!("{:02}", month);
    let mut fallback_stmt = conn
        .prepare(
            "SELECT date(created_at) as date, AVG(mood) as avg_mood, COUNT(*) as count
             FROM journal_entries
             WHERE strftime('%Y', created_at) = ?1
               AND strftime('%m', created_at) = ?2
             GROUP BY date(created_at)
             ORDER BY date",
        )
        .map_err(|e| format!("Fallback prepare failed: {}", e))?;

    let fallback_data = fallback_stmt
        .query_map(params![year_str, month_str], |row| {
            Ok(CalendarDayData {
                date: row.get(0)?,
                average_mood: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Fallback query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Fallback row parsing failed: {}", e))?;

    for row in &fallback_data {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO mood_daily_stats (date, average_mood, entry_count)
             VALUES (?1, ?2, ?3)",
            params![row.date, row.average_mood, row.entry_count],
        );
    }

    Ok(fallback_data)
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}
