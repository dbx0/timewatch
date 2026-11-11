use chrono::{Datelike, Duration, LocalResult, NaiveDate, NaiveTime, TimeZone};

use super::Ms;

/// Resolves a local naive datetime to UTC ms. Ambiguous: earliest.
/// Nonexistent (DST gap): first valid instant after it.
fn resolve<Tz: TimeZone>(tz: &Tz, naive: chrono::NaiveDateTime) -> Ms {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => dt.timestamp_millis(),
        LocalResult::Ambiguous(earliest, _) => earliest.timestamp_millis(),
        LocalResult::None => {
            // Step forward minute by minute until the gap ends (gaps are at most a few hours).
            let mut n = naive;
            for _ in 0..(24 * 60) {
                n += Duration::minutes(1);
                if let LocalResult::Single(dt) | LocalResult::Ambiguous(dt, _) =
                    tz.from_local_datetime(&n)
                {
                    return dt.timestamp_millis();
                }
            }
            naive.and_utc().timestamp_millis()
        }
    }
}

/// Local midnight of `day` to local midnight of the next day, as UTC ms.
pub fn day_bounds<Tz: TimeZone>(tz: &Tz, day: NaiveDate) -> (Ms, Ms) {
    let start = resolve(tz, day.and_time(NaiveTime::MIN));
    let next = day.succ_opt().unwrap_or(day);
    (start, resolve(tz, next.and_time(NaiveTime::MIN)))
}

pub fn local_day<Tz: TimeZone>(tz: &Tz, ms: Ms) -> NaiveDate {
    tz.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.date_naive())
        .unwrap_or_default()
}

pub fn at<Tz: TimeZone>(tz: &Tz, day: NaiveDate, t: NaiveTime) -> Ms {
    resolve(tz, day.and_time(t))
}

/// Monday of the week containing `day`.
pub fn week_start(day: NaiveDate) -> NaiveDate {
    day - Duration::days(day.weekday().num_days_from_monday() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, NaiveDate, NaiveTime};
    use chrono_tz::America::New_York;

    fn d(y: i32, m: u32, dd: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, dd).unwrap()
    }

    #[test]
    fn day_bounds_fixed_offset() {
        let tz = FixedOffset::west_opt(3 * 3600).unwrap();
        let (s, e) = day_bounds(&tz, d(2026, 11, 11));
        assert_eq!(e - s, 86_400_000);
        assert_eq!(local_day(&tz, s), d(2026, 11, 11));
        assert_eq!(local_day(&tz, e - 1), d(2026, 11, 11));
        assert_eq!(local_day(&tz, e), d(2026, 11, 12));
        let t = NaiveTime::from_hms_opt(12, 0, 0).unwrap();
        assert_eq!(at(&tz, d(2026, 11, 11), t), s + 12 * 3_600_000);
    }

    #[test]
    fn day_bounds_dst() {
        let (s, e) = day_bounds(&New_York, d(2026, 3, 8));
        assert_eq!(e - s, 23 * 3_600_000);
        let (s, e) = day_bounds(&New_York, d(2026, 11, 1));
        assert_eq!(e - s, 25 * 3_600_000);
    }

    #[test]
    fn week_start_is_monday() {
        assert_eq!(week_start(d(2026, 11, 11)), d(2026, 11, 9));
        assert_eq!(week_start(d(2026, 11, 15)), d(2026, 11, 9));
        assert_eq!(week_start(d(2026, 11, 9)), d(2026, 11, 9));
    }
}
