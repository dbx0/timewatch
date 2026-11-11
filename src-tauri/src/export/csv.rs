use chrono::{DateTime, TimeZone};

use crate::domain::calc::{round_ms, DayCalc};
use crate::domain::Project;

use super::fmt_hours;

const BOM: &str = "\u{feff}";

pub(super) fn field(s: &str) -> String {
    if s.contains([';', '"', '\r', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn line(fields: &[&str]) -> String {
    let mut l = fields.iter().map(|f| field(f)).collect::<Vec<_>>().join(";");
    l.push_str("\r\n");
    l
}

fn names(projects: &[Project], id: i64) -> (&str, &str) {
    projects
        .iter()
        .find(|p| p.id == id)
        .map_or(("", ""), |p| (p.client.as_str(), p.name.as_str()))
}

/// One row per day per project with time; normal and extra rounded separately (spec 6.6),
/// total is their sum.
pub fn csv_summary(days: &[DayCalc], projects: &[Project], rounding_min: u32) -> String {
    let mut out = String::from(BOM);
    out.push_str(&line(&[
        "data",
        "cliente",
        "projeto",
        "horas_normais",
        "horas_extras",
        "horas_total",
    ]));
    for d in days {
        let mut rows: Vec<(&str, &str, i64, i64)> = d
            .per_project
            .iter()
            .filter(|(_, pd)| pd.normal_ms + pd.extra_ms > 0)
            .map(|(id, pd)| {
                let (c, n) = names(projects, *id);
                (c, n, round_ms(pd.normal_ms, rounding_min), round_ms(pd.extra_ms, rounding_min))
            })
            .collect();
        rows.sort_by_key(|(c, n, ..)| (c.to_lowercase(), n.to_lowercase()));
        for (c, n, normal, extra) in rows {
            out.push_str(&line(&[
                &d.day.format("%Y-%m-%d").to_string(),
                c,
                n,
                &fmt_hours(normal),
                &fmt_hours(extra),
                &fmt_hours(normal + extra),
            ]));
        }
    }
    out
}

pub(super) fn hhmm<Tz: TimeZone>(tz: &Tz, ms: i64) -> String {
    DateTime::from_timestamp_millis(ms)
        .map_or_else(String::new, |t| t.with_timezone(tz).naive_local().format("%H:%M").to_string())
}

/// One row per segment, `HH:MM` in `tz`, exact (unrounded) duration, and the entry's note.
pub fn csv_detailed<Tz: TimeZone>(days: &[DayCalc], projects: &[Project], tz: &Tz) -> String {
    let mut out = String::from(BOM);
    out.push_str(&line(&["data", "cliente", "projeto", "inicio", "fim", "horas", "nota"]));
    for d in days {
        for s in &d.segments {
            let (c, n) = names(projects, s.project_id);
            out.push_str(&line(&[
                &d.day.format("%Y-%m-%d").to_string(),
                c,
                n,
                &hhmm(tz, s.start),
                &hhmm(tz, s.end),
                &fmt_hours(s.end - s.start),
                s.note.as_deref().unwrap_or(""),
            ]));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calc::{ProjectDay, Seg};
    use crate::domain::calc::LunchStatus;
    use chrono::{FixedOffset, NaiveDate};
    use std::collections::BTreeMap;

    const H: i64 = 3_600_000;

    fn tz() -> FixedOffset {
        FixedOffset::west_opt(3 * 3600).unwrap()
    }
    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 11).unwrap()
    }
    fn proj(id: i64, name: &str, client: &str) -> Project {
        Project { id, name: name.into(), client: client.into(), color: "#fff".into(), archived: false }
    }
    fn calc(segments: Vec<Seg>, per: &[(i64, i64, i64)]) -> DayCalc {
        DayCalc {
            day: day(),
            segments,
            per_project: per
                .iter()
                .map(|(id, n, e)| (*id, ProjectDay { normal_ms: *n, extra_ms: *e }))
                .collect::<BTreeMap<_, _>>(),
            lunch: None,
            auto_lunch: None,
            lunch_status: LunchStatus::Disabled,
            jornada_ms: 8 * H,
            is_holiday: false,
        }
    }

    #[test]
    fn csv_summary_rows_and_bom() {
        let projects = [proj(1, "Alpha", "Acme"), proj(2, "Beta", "Acme"), proj(3, "Idle", "Acme")];
        let d = calc(vec![], &[(1, 5 * H + H / 2, 0), (2, 8 * H - 7 * H, 2 * H + 10 * 60_000), (3, 0, 0)]);
        let out = csv_summary(std::slice::from_ref(&d), &projects, 0);
        assert!(out.starts_with('\u{feff}'));
        let body = out.trim_start_matches('\u{feff}');
        assert_eq!(
            body,
            "data;cliente;projeto;horas_normais;horas_extras;horas_total\r\n\
             2026-11-11;Acme;Alpha;5,5;0;5,5\r\n\
             2026-11-11;Acme;Beta;1;2,17;3,17\r\n"
        );
        // rounding 15: extra 2h10 -> 2,25
        let r = csv_summary(&[d], &projects, 15);
        assert!(r.contains("2026-11-11;Acme;Beta;1;2,25;3,25\r\n"));
    }

    #[test]
    fn csv_escapes_semicolon_and_quotes() {
        let projects = [proj(1, "Line\nbreak", "Acme; \"Brasil\"")];
        let d = calc(vec![], &[(1, H, 0)]);
        let out = csv_summary(&[d], &projects, 0);
        assert!(out.contains("2026-11-11;\"Acme; \"\"Brasil\"\"\";\"Line\nbreak\";1;0;1\r\n"));
    }

    #[test]
    fn csv_detailed_times() {
        let projects = [proj(1, "Alpha", "Acme")];
        let start = tz().with_ymd_and_hms(2026, 11, 11, 9, 0, 0).unwrap().timestamp_millis();
        let end = tz().with_ymd_and_hms(2026, 11, 11, 12, 30, 0).unwrap().timestamp_millis();
        let seg = Seg { entry_id: 1, project_id: 1, start, end, running: false, note: None };
        let out = csv_detailed(&[calc(vec![seg], &[(1, 3 * H + H / 2, 0)])], &projects, &tz());
        assert_eq!(
            out,
            "\u{feff}data;cliente;projeto;inicio;fim;horas;nota\r\n2026-11-11;Acme;Alpha;09:00;12:30;3,5;\r\n"
        );
    }

    #[test]
    fn csv_detailed_note_is_escaped() {
        let projects = [proj(1, "Alpha", "Acme")];
        let start = tz().with_ymd_and_hms(2026, 11, 11, 9, 0, 0).unwrap().timestamp_millis();
        let note = Some("revisão; \"PR\"\nlinha 2".to_string());
        let seg = Seg { entry_id: 1, project_id: 1, start, end: start + H, running: false, note };
        let out = csv_detailed(&[calc(vec![seg], &[(1, H, 0)])], &projects, &tz());
        assert!(out.ends_with("2026-11-11;Acme;Alpha;09:00;10:00;1;\"revisão; \"\"PR\"\"\nlinha 2\"\r\n"), "{out}");
    }

    #[test]
    fn csv_summary_has_no_note_column() {
        let out = csv_summary(&[], &[], 0);
        assert!(!out.contains("nota"));
    }
}
