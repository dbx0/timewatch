use chrono::{Datelike, TimeZone};

use crate::domain::calc::{Cell, DayCalc, Grouping, RowKind, WeekReport};
use crate::domain::Project;
use crate::i18n::Lang;

use super::csv::hhmm;
use super::{client_label, fmt_hours};

pub(super) fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            c => o.push(c),
        }
    }
    o
}

const CSS: &str = "*{box-sizing:border-box}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;\
color:#1a1d24;background:#fff;margin:32px auto;max-width:1000px;padding:0 24px}\
h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 8px}.period{color:#5a6070;margin:0 0 20px}\
.cards{display:flex;gap:12px;margin-bottom:24px}.card{flex:1;border:1px solid #d9dde6;border-radius:10px;padding:12px 16px}\
.card .l{font-size:12px;color:#5a6070}.card .v{font-size:24px;font-weight:600;margin-top:2px}\
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}\
th,td{padding:6px 10px;border-bottom:1px solid #e6e9f0;text-align:right;vertical-align:top}\
th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#5a6070;font-weight:600}\
tr.client td{font-weight:600;background:#f3f5fa;text-align:left}\
tr.total td{font-weight:600;border-top:2px solid #1a1d24}\
.extra{display:block;font-size:11px;color:#2f5fd0}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}\
.muted{color:#5a6070}tr.lunch td{color:#5a6070;font-style:italic}td.note{text-align:left;white-space:pre-wrap;color:#3a4050}\
@media print{body{margin:0;max-width:none;padding:0}.card,tr{break-inside:avoid}h2{break-after:avoid}}";

fn cell(c: &Cell, lang: Lang) -> String {
    let t = lang.strings();
    if c.total_ms == 0 {
        return "<td></td>".into();
    }
    let extra = if c.extra_ms > 0 {
        format!(
            "<span class=\"extra\">+{} {}</span>",
            fmt_hours(c.extra_ms, lang),
            t.extra_suffix
        )
    } else {
        String::new()
    };
    format!("<td>{}{}</td>", fmt_hours(c.total_ms, lang), extra)
}

fn color_ok(c: &str) -> bool {
    c.len() <= 9 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit())
}

pub fn html_report<Tz: TimeZone>(
    report: &WeekReport,
    detailed: Option<(&[DayCalc], &[Project])>,
    tz: &Tz,
    lang: Lang,
) -> String {
    let t = lang.strings();
    let fmt_d = |d: chrono::NaiveDate| d.format(t.date_fmt).to_string();
    let mut h = String::new();
    h.push_str(&format!(
        "<!DOCTYPE html>\n<html lang=\"{}\"><head><meta charset=\"utf-8\">",
        lang.code()
    ));
    h.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    h.push_str(&format!(
        "<title>{}</title><style>{CSS}</style></head><body>",
        esc(t.export_title)
    ));
    h.push_str(&format!("<h1>{}</h1>", esc(t.export_title)));
    h.push_str(&format!(
        "<p class=\"period\">{} {} {}</p>",
        fmt_d(report.days[0]),
        t.period_to,
        fmt_d(report.days[6])
    ));
    h.push_str("<div class=\"cards\">");
    for (label, ms) in [
        (t.card_total, report.total.total_ms),
        (t.card_expected, report.expected_ms),
        (t.card_extra, report.total.extra_ms),
    ] {
        h.push_str(&format!(
            "<div class=\"card\"><div class=\"l\">{}</div><div class=\"v\">{}</div></div>",
            esc(label),
            fmt_hours(ms, lang)
        ));
    }
    h.push_str("</div><table><thead><tr>");
    let first = match report.grouping {
        Grouping::Project => t.col_project,
        Grouping::Client => t.col_client,
    };
    h.push_str(&format!("<th>{}</th>", esc(first)));
    for d in &report.days {
        h.push_str(&format!(
            "<th>{} {}</th>",
            t.day_names[d.weekday().num_days_from_monday() as usize],
            d.format(t.short_date_fmt)
        ));
    }
    h.push_str(&format!(
        "<th>{}</th></tr></thead><tbody>",
        esc(t.col_total)
    ));

    for r in &report.rows {
        if r.kind == RowKind::ClientHeader {
            h.push_str(&format!(
                "<tr class=\"client\"><td colspan=\"9\">{}</td></tr>",
                esc(client_label(&r.label, lang))
            ));
            continue;
        }
        let dot = match r.color.as_deref() {
            Some(c) if color_ok(c) => {
                format!("<span class=\"dot\" style=\"background:{c}\"></span>")
            }
            _ => String::new(),
        };
        let sub = if r.project_count > 1 {
            format!(
                " <span class=\"muted\">({} {})</span>",
                r.project_count, t.projects_suffix
            )
        } else {
            String::new()
        };
        let label = match report.grouping {
            Grouping::Project => r.label.as_str(),
            Grouping::Client => client_label(&r.label, lang),
        };
        h.push_str(&format!("<tr><td>{dot}{}{sub}</td>", esc(label)));
        for c in &r.cells {
            h.push_str(&cell(c, lang));
        }
        h.push_str(&cell(&r.total, lang));
        h.push_str("</tr>");
    }

    h.push_str(&format!(
        "<tr class=\"total\"><td>{}</td>",
        esc(t.row_total)
    ));
    for c in &report.col_totals {
        h.push_str(&format!(
            "<td>{}</td>",
            if c.total_ms == 0 {
                String::new()
            } else {
                fmt_hours(c.total_ms, lang)
            }
        ));
    }
    h.push_str(&format!(
        "<td>{}</td></tr>",
        fmt_hours(report.total.total_ms, lang)
    ));
    h.push_str(&format!("<tr><td>{}</td>", esc(t.row_extra)));
    for c in &report.col_totals {
        h.push_str(&format!(
            "<td>{}</td>",
            if c.extra_ms == 0 {
                String::new()
            } else {
                fmt_hours(c.extra_ms, lang)
            }
        ));
    }
    h.push_str(&format!(
        "<td>{}</td></tr></tbody></table>",
        fmt_hours(report.total.extra_ms, lang)
    ));

    if let Some((days, projects)) = detailed {
        h.push_str(&format!(
            "<h2>{}</h2><table><thead><tr><th>{}</th><th>{}</th><th>{}</th><th>{}</th><th>{}</th><th>{}</th></tr></thead><tbody>",
            esc(t.records_title),
            esc(t.rec_date),
            esc(&format!("{} / {}", t.col_client, t.col_project)),
            esc(t.rec_start),
            esc(t.rec_end),
            esc(t.rec_hours),
            esc(t.rec_note),
        ));
        let names = |id: i64| {
            projects.iter().find(|p| p.id == id).map_or(("", ""), |p| {
                (client_label(&p.client, lang), p.name.as_str())
            })
        };
        for d in days {
            for s in &d.segments {
                let (c, n) = names(s.project_id);
                h.push_str(&format!(
                    "<tr><td>{}</td><td>{} / {}</td><td>{}</td><td>{}</td><td>{}</td><td class=\"note\">{}</td></tr>",
                    d.day.format(t.date_fmt),
                    esc(c),
                    esc(n),
                    hhmm(tz, s.start),
                    hhmm(tz, s.end),
                    fmt_hours(s.end - s.start, lang),
                    esc(s.note.as_deref().unwrap_or(""))
                ));
            }
            // The automatic lunch as its own negative row, so the records add up to the summary.
            if let Some(l) = &d.auto_lunch {
                let (c, n) = names(l.project_id);
                h.push_str(&format!(
                    "<tr class=\"lunch\"><td>{}</td><td>{} / {}</td><td></td><td></td><td>{}</td><td class=\"note\">{}</td></tr>",
                    d.day.format(t.date_fmt),
                    esc(c),
                    esc(n),
                    fmt_hours(-l.ms, lang),
                    esc(t.auto_lunch)
                ));
            }
        }
        h.push_str("</tbody></table>");
    }
    h.push_str("</body></html>\n");
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::calc::Grouping;
    use crate::domain::Settings;
    use crate::i18n::Lang;
    use crate::store::db::Db;
    use crate::tracker::Tracker;
    use chrono::{FixedOffset, NaiveDate};

    const H: i64 = 3_600_000;

    fn tz() -> FixedOffset {
        FixedOffset::west_opt(3 * 3600).unwrap()
    }

    fn report(client: &str, name: &str) -> (Tracker, WeekReport) {
        let mut tr = Tracker::new(Db::open_in_memory().unwrap());
        let p = tr.create_project(name, client, "#4f86ff").unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 11, 11).unwrap();
        let s = tz()
            .from_local_datetime(&day.and_hms_opt(6, 0, 0).unwrap())
            .unwrap()
            .timestamp_millis();
        let now = s + 20 * H;
        tr.add_entry(p.id, s, s + 5 * H + H / 2, now).unwrap();
        tr.set_settings(Settings::default()).unwrap();
        let ws = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let r = tr.week_report(&tz(), ws, now, Grouping::Project).unwrap();
        (tr, r)
    }

    #[test]
    fn html_day_headers_follow_a_saturday_week() {
        let (tr, _) = report("Acme", "Alpha");
        let sat = NaiveDate::from_ymd_opt(2026, 11, 7).unwrap();
        let r = tr
            .week_report(
                &tz(),
                sat,
                sat.and_hms_opt(12, 0, 0)
                    .unwrap()
                    .and_utc()
                    .timestamp_millis(),
                Grouping::Project,
            )
            .unwrap();
        let out = html_report(&r, None, &tz(), Lang::En);
        let sat_at = out.find("<th>Sat ").expect("saturday header");
        let mon_at = out.find("<th>Mon ").expect("monday header");
        assert!(sat_at < mon_at);
    }

    #[test]
    fn html_escapes_names() {
        let (_tr, r) = report("<script>alert(1)</script>", "A & B");
        let out = html_report(&r, None, &tz(), Lang::PtBr);
        assert!(!out.contains("<script>"));
        assert!(out.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(out.contains("A &amp; B"));
    }

    #[test]
    fn html_contains_totals() {
        let (tr, r) = report("Acme", "Alpha");
        let out = html_report(&r, None, &tz(), Lang::PtBr);
        assert!(out.contains("Horas da semana"));
        assert!(out.contains("09/11/2026 a 15/11/2026"));
        assert!(out.contains("<div class=\"v\">5,5</div>"));
        assert!(out.contains("<div class=\"v\">40</div>"));
        assert!(!out.contains("Registros"));
        let now = r
            .week_start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis()
            + 5 * 24 * H;
        let days: Vec<_> = r
            .days
            .iter()
            .map(|d| tr.day_calc(&tz(), *d, now).unwrap())
            .collect();
        let projects = tr.projects().unwrap();
        let det = html_report(&r, Some((&days, &projects)), &tz(), Lang::PtBr);
        assert!(det.contains("Registros"));
        assert!(det.contains("<th>Nota</th>"));
        assert!(det.contains("<td>06:00</td><td>11:30</td><td>5,5</td><td class=\"note\"></td>"));
    }

    #[test]
    fn html_detailed_shows_escaped_note() {
        let (mut tr, r) = report("Acme", "Alpha");
        let now = r
            .week_start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis()
            + 5 * 24 * H;
        let id = r
            .days
            .iter()
            .find_map(|d| {
                tr.day_calc(&tz(), *d, now)
                    .unwrap()
                    .segments
                    .first()
                    .map(|s| s.entry_id)
            })
            .unwrap();
        tr.set_entry_note(id, Some("<b>deploy</b> & \"testes\"".into()))
            .unwrap();
        let days: Vec<_> = r
            .days
            .iter()
            .map(|d| tr.day_calc(&tz(), *d, now).unwrap())
            .collect();
        let projects = tr.projects().unwrap();
        let det = html_report(&r, Some((&days, &projects)), &tz(), Lang::PtBr);
        assert!(!det.contains("<b>deploy"));
        assert!(det.contains(
            "<td class=\"note\">&lt;b&gt;deploy&lt;/b&gt; &amp; &quot;testes&quot;</td>"
        ));
    }

    fn week_days(tr: &Tracker, r: &WeekReport) -> Vec<DayCalc> {
        let now = r
            .week_start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis()
            + 5 * 24 * H;
        r.days
            .iter()
            .map(|d| tr.day_calc(&tz(), *d, now).unwrap())
            .collect()
    }

    #[test]
    fn html_empty_client_is_the_no_client_label() {
        let (tr, r) = report("", "Alpha");
        let out = html_report(&r, None, &tz(), Lang::PtBr);
        assert!(out.contains("<tr class=\"client\"><td colspan=\"9\">Sem cliente</td></tr>"));
        let days = week_days(&tr, &r);
        let projects = tr.projects().unwrap();
        let det = html_report(&r, Some((&days, &projects)), &tz(), Lang::En);
        assert!(det.contains("<td>No client / Alpha</td>"), "{det}");
        let r = tr
            .week_report(
                &tz(),
                r.week_start,
                r.days[6]
                    .and_hms_opt(23, 0, 0)
                    .unwrap()
                    .and_utc()
                    .timestamp_millis(),
                Grouping::Client,
            )
            .unwrap();
        let out = html_report(&r, None, &tz(), Lang::Es);
        assert!(out.contains("<tr><td>Sin cliente</td>"), "{out}");
    }

    #[test]
    fn html_detailed_lists_auto_lunch() {
        // 06:00-11:30 covers no 12:00 reference; a 10:00-15:00 block does.
        let (mut tr, _) = report("Acme", "Alpha");
        let day = NaiveDate::from_ymd_opt(2026, 11, 12).unwrap();
        let s = tz()
            .from_local_datetime(&day.and_hms_opt(10, 0, 0).unwrap())
            .unwrap()
            .timestamp_millis();
        let pid = tr.projects().unwrap()[0].id;
        tr.add_entry(pid, s, s + 5 * H, s + 20 * H).unwrap();
        let ws = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let r = tr
            .week_report(&tz(), ws, s + 4 * 24 * H, Grouping::Project)
            .unwrap();
        let days = week_days(&tr, &r);
        let projects = tr.projects().unwrap();
        let det = html_report(&r, Some((&days, &projects)), &tz(), Lang::PtBr);
        assert!(
            det.contains("<tr class=\"lunch\"><td>12/11/2026</td><td>Acme / Alpha</td><td></td><td></td><td>-1</td><td class=\"note\">Almoço (automático)</td></tr>"),
            "{det}"
        );
    }

    #[test]
    fn html_pt_br_lang_attribute() {
        let (_tr, r) = report("Acme", "Alpha");
        assert!(html_report(&r, None, &tz(), Lang::PtBr).contains("<html lang=\"pt-BR\">"));
    }

    #[test]
    fn html_in_english() {
        let (tr, r) = report("Acme", "Alpha");
        let out = html_report(&r, None, &tz(), Lang::En);
        assert!(out.contains("<html lang=\"en\">"));
        assert!(out.contains("<h1>Weekly hours</h1>"));
        assert!(out.contains("11/09/2026 to 11/15/2026"));
        assert!(out.contains("<div class=\"l\">Expected workday</div>"));
        assert!(out.contains("<div class=\"v\">5.5</div>"));
        assert!(out.contains("<th>Mon 11/09</th>"));
        assert!(out.contains("<td>Overtime</td>"));
        let now = r
            .week_start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis()
            + 5 * 24 * H;
        let days: Vec<_> = r
            .days
            .iter()
            .map(|d| tr.day_calc(&tz(), *d, now).unwrap())
            .collect();
        let projects = tr.projects().unwrap();
        let det = html_report(&r, Some((&days, &projects)), &tz(), Lang::En);
        assert!(det.contains("<h2>Records</h2>"));
        assert!(det.contains("<th>Client / Project</th>"));
        assert!(det.contains("<tr><td>11/11/2026</td>"));
    }

    #[test]
    fn html_in_spanish() {
        let (_tr, r) = report("Acme", "Alpha");
        let out = html_report(&r, None, &tz(), Lang::Es);
        assert!(out.contains("<html lang=\"es\">"));
        assert!(out.contains("<h1>Horas de la semana</h1>"));
        assert!(out.contains("09/11/2026 a 15/11/2026"));
        assert!(out.contains("<th>Lun 09/11</th>"));
        assert!(out.contains("<div class=\"v\">5,5</div>"));
        assert!(out.contains("<td>Horas extra</td>"));
    }
}
