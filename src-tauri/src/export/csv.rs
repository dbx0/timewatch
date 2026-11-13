use chrono::{DateTime, TimeZone};

use crate::domain::calc::{round_ms, DayCalc};
use crate::domain::Project;
use crate::i18n::Lang;

use super::{client_label, fmt_hours};

const BOM: &str = "\u{feff}";

/// Quotes `s` when it holds the separator, a quote or a line break.
pub(super) fn field(s: &str, sep: char) -> String {
    if s.contains([sep, '"', '\r', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Free text (client, project, note) a spreadsheet must not run as a formula: a leading
/// `= + - @`, tab or carriage return gets a `'` prefix. Numeric columns never pass here.
pub(super) fn text(s: &str) -> String {
    if s.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{s}")
    } else {
        s.to_string()
    }
}

fn line(fields: &[&str], lang: Lang) -> String {
    let sep = lang.csv_sep();
    let mut l = fields
        .iter()
        .map(|f| field(f, sep))
        .collect::<Vec<_>>()
        .join(&sep.to_string());
    l.push_str("\r\n");
    l
}

/// Client (as displayed) and project name of `id`, both formula-safe.
fn names(projects: &[Project], id: i64, lang: Lang) -> (String, String) {
    projects
        .iter()
        .find(|p| p.id == id)
        .map_or((String::new(), String::new()), |p| {
            (text(client_label(&p.client, lang)), text(&p.name))
        })
}

/// One row per day per project with time; normal and extra rounded separately (spec 6.6),
/// total is their sum. Headers, separator and decimal follow `lang` (en: `,` and `.`).
pub fn csv_summary(
    days: &[DayCalc],
    projects: &[Project],
    rounding_min: u32,
    lang: Lang,
) -> String {
    let mut out = String::from(BOM);
    out.push_str(&line(&lang.strings().csv_summary_header, lang));
    for d in days {
        let mut rows: Vec<(String, String, i64, i64)> = d
            .per_project
            .iter()
            .filter(|(_, pd)| pd.normal_ms + pd.extra_ms > 0)
            .map(|(id, pd)| {
                let (c, n) = names(projects, *id, lang);
                (
                    c,
                    n,
                    round_ms(pd.normal_ms, rounding_min),
                    round_ms(pd.extra_ms, rounding_min),
                )
            })
            .collect();
        rows.sort_by_key(|(c, n, ..)| (c.to_lowercase(), n.to_lowercase()));
        for (c, n, normal, extra) in rows {
            out.push_str(&line(
                &[
                    &d.day.format("%Y-%m-%d").to_string(),
                    &c,
                    &n,
                    &fmt_hours(normal, lang),
                    &fmt_hours(extra, lang),
                    &fmt_hours(normal + extra, lang),
                ],
                lang,
            ));
        }
    }
    out
}

pub(super) fn hhmm<Tz: TimeZone>(tz: &Tz, ms: i64) -> String {
    DateTime::from_timestamp_millis(ms).map_or_else(String::new, |t| {
        t.with_timezone(tz)
            .naive_local()
            .format("%H:%M")
            .to_string()
    })
}

/// One row per segment, `HH:MM` in `tz`, exact (unrounded) duration, and the entry's note.
/// A day with automatic lunch gets one more row with the negative discount (no times), so the
/// rows add up to the summary.
pub fn csv_detailed<Tz: TimeZone>(
    days: &[DayCalc],
    projects: &[Project],
    tz: &Tz,
    lang: Lang,
) -> String {
    let mut out = String::from(BOM);
    out.push_str(&line(&lang.strings().csv_detailed_header, lang));
    for d in days {
        let date = d.day.format("%Y-%m-%d").to_string();
        for s in &d.segments {
            let (c, n) = names(projects, s.project_id, lang);
            out.push_str(&line(
                &[
                    &date,
                    &c,
                    &n,
                    &hhmm(tz, s.start),
                    &hhmm(tz, s.end),
                    &fmt_hours(s.end - s.start, lang),
                    &text(s.note.as_deref().unwrap_or("")),
                ],
                lang,
            ));
        }
        if let Some(l) = &d.auto_lunch {
            let (c, n) = names(projects, l.project_id, lang);
            out.push_str(&line(
                &[
                    &date,
                    &c,
                    &n,
                    "",
                    "",
                    &fmt_hours(-l.ms, lang),
                    &text(lang.strings().auto_lunch),
                ],
                lang,
            ));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calc::LunchStatus;
    use crate::domain::calc::{AutoLunch, ProjectDay, Seg};
    use crate::i18n::Lang;
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
        Project {
            id,
            name: name.into(),
            client: client.into(),
            color: "#fff".into(),
            archived: false,
        }
    }
    fn calc(segments: Vec<Seg>, per: &[(i64, i64, i64)]) -> DayCalc {
        DayCalc {
            day: day(),
            segments,
            per_project: per
                .iter()
                .map(|(id, n, e)| {
                    (
                        *id,
                        ProjectDay {
                            normal_ms: *n,
                            extra_ms: *e,
                        },
                    )
                })
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
        let projects = [
            proj(1, "Alpha", "Acme"),
            proj(2, "Beta", "Acme"),
            proj(3, "Idle", "Acme"),
        ];
        let d = calc(
            vec![],
            &[
                (1, 5 * H + H / 2, 0),
                (2, 8 * H - 7 * H, 2 * H + 10 * 60_000),
                (3, 0, 0),
            ],
        );
        let out = csv_summary(std::slice::from_ref(&d), &projects, 0, Lang::PtBr);
        assert!(out.starts_with('\u{feff}'));
        let body = out.trim_start_matches('\u{feff}');
        assert_eq!(
            body,
            "data;cliente;projeto;horas_normais;horas_extras;horas_total\r\n\
             2026-11-11;Acme;Alpha;5,5;0;5,5\r\n\
             2026-11-11;Acme;Beta;1;2,17;3,17\r\n"
        );
        // rounding 15: extra 2h10 -> 2,25
        let r = csv_summary(&[d], &projects, 15, Lang::PtBr);
        assert!(r.contains("2026-11-11;Acme;Beta;1;2,25;3,25\r\n"));
    }

    #[test]
    fn csv_escapes_semicolon_and_quotes() {
        let projects = [proj(1, "Line\nbreak", "Acme; \"Brasil\"")];
        let d = calc(vec![], &[(1, H, 0)]);
        let out = csv_summary(&[d], &projects, 0, Lang::PtBr);
        assert!(out.contains("2026-11-11;\"Acme; \"\"Brasil\"\"\";\"Line\nbreak\";1;0;1\r\n"));
    }

    #[test]
    fn csv_detailed_times() {
        let projects = [proj(1, "Alpha", "Acme")];
        let start = tz()
            .with_ymd_and_hms(2026, 11, 11, 9, 0, 0)
            .unwrap()
            .timestamp_millis();
        let end = tz()
            .with_ymd_and_hms(2026, 11, 11, 12, 30, 0)
            .unwrap()
            .timestamp_millis();
        let seg = Seg {
            entry_id: 1,
            project_id: 1,
            start,
            end,
            running: false,
            note: None,
        };
        let out = csv_detailed(
            &[calc(vec![seg], &[(1, 3 * H + H / 2, 0)])],
            &projects,
            &tz(),
            Lang::PtBr,
        );
        assert_eq!(
            out,
            "\u{feff}data;cliente;projeto;inicio;fim;horas;nota\r\n2026-11-11;Acme;Alpha;09:00;12:30;3,5;\r\n"
        );
    }

    #[test]
    fn csv_detailed_note_is_escaped() {
        let projects = [proj(1, "Alpha", "Acme")];
        let start = tz()
            .with_ymd_and_hms(2026, 11, 11, 9, 0, 0)
            .unwrap()
            .timestamp_millis();
        let note = Some("revisão; \"PR\"\nlinha 2".to_string());
        let seg = Seg {
            entry_id: 1,
            project_id: 1,
            start,
            end: start + H,
            running: false,
            note,
        };
        let out = csv_detailed(
            &[calc(vec![seg], &[(1, H, 0)])],
            &projects,
            &tz(),
            Lang::PtBr,
        );
        assert!(
            out.ends_with(
                "2026-11-11;Acme;Alpha;09:00;10:00;1;\"revisão; \"\"PR\"\"\nlinha 2\"\r\n"
            ),
            "{out}"
        );
    }

    #[test]
    fn csv_text_fields_cannot_start_a_formula() {
        let projects = [
            proj(1, "=HYPERLINK(\"x\")", "+Acme"),
            proj(2, "@SUM(A1)", "-1"),
            proj(3, "\tTab", "\rCr"),
        ];
        let d = calc(vec![], &[(1, H, 0), (2, H, 0), (3, H, 0)]);
        let out = csv_summary(&[d], &projects, 0, Lang::PtBr);
        assert!(
            out.contains("2026-11-11;'+Acme;\"'=HYPERLINK(\"\"x\"\")\";1;0;1\r\n"),
            "{out}"
        );
        assert!(out.contains("2026-11-11;'-1;'@SUM(A1);1;0;1\r\n"), "{out}");
        assert!(
            out.contains("2026-11-11;\"'\rCr\";'\tTab;1;0;1\r\n"),
            "{out}"
        );
        let start = tz()
            .with_ymd_and_hms(2026, 11, 11, 9, 0, 0)
            .unwrap()
            .timestamp_millis();
        let seg = Seg {
            entry_id: 1,
            project_id: 1,
            start,
            end: start + H,
            running: false,
            note: Some("=1+1".into()),
        };
        let out = csv_detailed(
            &[calc(vec![seg], &[(1, H, 0)])],
            &projects,
            &tz(),
            Lang::PtBr,
        );
        assert!(out.ends_with(";09:00;10:00;1;'=1+1\r\n"), "{out}");
    }

    #[test]
    fn csv_numbers_are_not_prefixed() {
        assert_eq!(field("-1,5", ';'), "-1,5");
        assert_eq!(text("-1,5"), "'-1,5");
        assert_eq!(text("Acme"), "Acme");
        assert_eq!(text(""), "");
    }

    #[test]
    fn csv_empty_client_is_the_no_client_label() {
        let projects = [proj(1, "Alpha", "")];
        let d = calc(vec![], &[(1, H, 0)]);
        let out = csv_summary(std::slice::from_ref(&d), &projects, 0, Lang::PtBr);
        assert!(
            out.contains("2026-11-11;Sem cliente;Alpha;1;0;1\r\n"),
            "{out}"
        );
        let out = csv_summary(std::slice::from_ref(&d), &projects, 0, Lang::En);
        assert!(
            out.contains("2026-11-11,No client,Alpha,1,0,1\r\n"),
            "{out}"
        );
        let out = csv_summary(&[d], &projects, 0, Lang::Es);
        assert!(
            out.contains("2026-11-11;Sin cliente;Alpha;1;0;1\r\n"),
            "{out}"
        );
    }

    #[test]
    fn csv_detailed_lists_auto_lunch_so_rows_add_up() {
        let projects = [proj(1, "Alpha", "Acme")];
        let start = tz()
            .with_ymd_and_hms(2026, 11, 11, 9, 0, 0)
            .unwrap()
            .timestamp_millis();
        let seg = Seg {
            entry_id: 1,
            project_id: 1,
            start,
            end: start + 9 * H,
            running: false,
            note: None,
        };
        let mut d = calc(vec![seg], &[(1, 8 * H, 0)]);
        d.auto_lunch = Some(AutoLunch {
            project_id: 1,
            ms: H,
        });
        d.lunch_status = LunchStatus::Auto;
        let out = csv_detailed(std::slice::from_ref(&d), &projects, &tz(), Lang::PtBr);
        assert!(
            out.ends_with(
                "2026-11-11;Acme;Alpha;09:00;18:00;9;\r\n2026-11-11;Acme;Alpha;;;-1;Almoço (automático)\r\n"
            ),
            "{out}"
        );
        let out = csv_detailed(&[d], &projects, &tz(), Lang::En);
        assert!(
            out.ends_with("2026-11-11,Acme,Alpha,,,-1,Lunch (automatic)\r\n"),
            "{out}"
        );
    }

    #[test]
    fn csv_summary_has_no_note_column() {
        let out = csv_summary(&[], &[], 0, Lang::PtBr);
        assert!(!out.contains("nota"));
    }

    #[test]
    fn csv_english_uses_comma_and_dot() {
        let projects = [proj(1, "Alpha", "Acme, Inc"), proj(2, "Beta", "Acme; Ltd")];
        let d = calc(
            vec![],
            &[(1, 5 * H + H / 2, 0), (2, H, 2 * H + 10 * 60_000)],
        );
        let out = csv_summary(&[d], &projects, 0, Lang::En);
        assert_eq!(
            out,
            "\u{feff}date,client,project,regular_hours,overtime_hours,total_hours\r\n\
             2026-11-11,\"Acme, Inc\",Alpha,5.5,0,5.5\r\n\
             2026-11-11,Acme; Ltd,Beta,1,2.17,3.17\r\n"
        );
        let start = tz()
            .with_ymd_and_hms(2026, 11, 11, 9, 0, 0)
            .unwrap()
            .timestamp_millis();
        let seg = Seg {
            entry_id: 1,
            project_id: 1,
            start,
            end: start + 3 * H + H / 2,
            running: false,
            note: Some("a, b".into()),
        };
        let out = csv_detailed(
            &[calc(vec![seg], &[(1, 3 * H + H / 2, 0)])],
            &projects,
            &tz(),
            Lang::En,
        );
        assert_eq!(
            out,
            "\u{feff}date,client,project,start,end,hours,note\r\n2026-11-11,\"Acme, Inc\",Alpha,09:00,12:30,3.5,\"a, b\"\r\n"
        );
    }

    #[test]
    fn csv_spanish_headers_semicolon_and_comma() {
        let projects = [proj(1, "Alpha", "Acme")];
        let d = calc(vec![], &[(1, 5 * H + H / 2, 0)]);
        let out = csv_summary(&[d], &projects, 0, Lang::Es);
        assert_eq!(
            out,
            "\u{feff}fecha;cliente;proyecto;horas_normales;horas_extra;horas_total\r\n2026-11-11;Acme;Alpha;5,5;0;5,5\r\n"
        );
        let out = csv_detailed(&[], &projects, &tz(), Lang::Es);
        assert_eq!(
            out,
            "\u{feff}fecha;cliente;proyecto;inicio;fin;horas;nota\r\n"
        );
    }
}
