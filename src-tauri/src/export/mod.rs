//! Week exports (CSV and HTML).

mod csv;
mod html;

use chrono::{NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use crate::domain::calc::Grouping;
use crate::domain::Ms;
use crate::tracker::{Tracker, TrackerError};

type Result<T> = std::result::Result<T, TrackerError>;

pub use csv::{csv_detailed, csv_summary};
pub use html::html_report;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Csv,
    Html,
}

/// Decimal hours with comma, at most 2 decimals, trailing zeros trimmed (`5,5`, `7,25`, `8`).
pub fn fmt_hours(ms: i64) -> String {
    let hundredths = (ms.abs() as i128 * 100 + 1_800_000) / 3_600_000;
    let sign = if ms < 0 && hundredths > 0 { "-" } else { "" };
    let (whole, frac) = (hundredths / 100, hundredths % 100);
    match frac {
        0 => format!("{sign}{whole}"),
        f if f % 10 == 0 => format!("{sign}{whole},{}", f / 10),
        f => format!("{sign}{whole},{f:02}"),
    }
}

pub fn export_week<Tz: TimeZone>(
    tracker: &Tracker,
    tz: &Tz,
    week_start: NaiveDate,
    now: Ms,
    grouping: Grouping,
    format: ExportFormat,
    detailed: bool,
) -> Result<String> {
    let report = tracker.week_report(tz, week_start, now, grouping)?;
    let projects = tracker.projects()?;
    let days = if detailed || format == ExportFormat::Csv {
        report
            .days
            .iter()
            .map(|d| tracker.day_calc(tz, *d, now))
            .collect::<Result<Vec<_>>>()?
    } else {
        Vec::new()
    };
    Ok(match (format, detailed) {
        (ExportFormat::Csv, false) => csv_summary(&days, &projects, report.rounding_min),
        (ExportFormat::Csv, true) => csv_detailed(&days, &projects, tz),
        (ExportFormat::Html, false) => html_report(&report, None, tz),
        (ExportFormat::Html, true) => html_report(&report, Some((&days, &projects)), tz),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: i64 = 3_600_000;

    #[test]
    fn fmt_hours_cases() {
        assert_eq!(fmt_hours(0), "0");
        assert_eq!(fmt_hours(8 * H), "8");
        assert_eq!(fmt_hours(5 * H + H / 2), "5,5");
        assert_eq!(fmt_hours(7 * H + H / 4), "7,25");
        assert_eq!(fmt_hours(H / 3), "0,33");
        assert_eq!(fmt_hours(2 * H / 3), "0,67");
        assert_eq!(fmt_hours(-H / 2), "-0,5");
    }
}
