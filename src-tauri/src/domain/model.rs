use chrono::{Datelike, NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};

/// UTC epoch milliseconds.
pub type Ms = i64;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub client: String,
    pub color: String,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: i64,
    pub project_id: i64,
    pub start: Ms,
    pub end: Option<Ms>,
    /// What the user did in this block (trimmed, at most `MAX_NOTE_CHARS`).
    #[serde(default)]
    pub note: Option<String>,
}

pub const MAX_NOTE_CHARS: usize = 500;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lunch {
    pub day: NaiveDate,
    pub start: Ms,
    pub end: Ms,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub rounding_min: u32,
    /// Daily target hours, Monday..Sunday.
    pub jornada_h: [f32; 7],
    pub holidays: Vec<NaiveDate>,
    pub lunch_min: u32,
    pub lunch_ref: NaiveTime,
    pub idle_min: u32,
    pub stop_on_sleep: bool,
    pub autostart: bool,
    pub shortcut: String,
    pub overlay_monitor: Option<String>,
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            rounding_min: 0,
            jornada_h: [8., 8., 8., 8., 8., 0., 0.],
            holidays: Vec::new(),
            lunch_min: 60,
            lunch_ref: NaiveTime::from_hms_opt(12, 0, 0).expect("valid time"),
            idle_min: 15,
            stop_on_sleep: false,
            autostart: true,
            shortcut: "Alt+Space".to_string(),
            overlay_monitor: None,
            onboarded: false,
        }
    }
}

impl Settings {
    /// Target work duration for `day` in ms; 0 on holidays.
    pub fn jornada_ms(&self, day: NaiveDate) -> i64 {
        if self.holidays.contains(&day) {
            return 0;
        }
        let h = self.jornada_h[day.weekday().num_days_from_monday() as usize];
        (h as f64 * 3_600_000.0).round() as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, NaiveTime};

    #[test]
    fn settings_defaults() {
        let s = Settings::default();
        assert_eq!(s.rounding_min, 0);
        assert_eq!(s.jornada_h, [8., 8., 8., 8., 8., 0., 0.]);
        assert_eq!(s.lunch_min, 60);
        assert_eq!(s.lunch_ref, NaiveTime::from_hms_opt(12, 0, 0).unwrap());
        assert_eq!(s.idle_min, 15);
        assert!(!s.stop_on_sleep);
        assert!(s.autostart);
        assert_eq!(s.shortcut, "Alt+Space");
        assert_eq!(s.overlay_monitor, None);
        assert!(!s.onboarded);
    }

    #[test]
    fn jornada_holiday_is_zero() {
        let monday = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let mut s = Settings::default();
        assert_eq!(s.jornada_ms(monday), 8 * 3_600_000);
        s.holidays.push(monday);
        assert_eq!(s.jornada_ms(monday), 0);
        let sat = NaiveDate::from_ymd_opt(2026, 11, 14).unwrap();
        assert_eq!(s.jornada_ms(sat), 0);
    }
}
