//! Pure calculations: day segments, lunch, overtime, rounding and weekly reports.
//! Everything works on exact UTC ms; rounding only happens in `week_report`.

use std::collections::BTreeMap;

use chrono::{Duration, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use super::time::{at, day_bounds};
use super::{Entry, Lunch, Ms, Project, Settings};

const MIN_MS: i64 = 60_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Seg {
    pub entry_id: i64,
    pub project_id: i64,
    pub start: Ms,
    pub end: Ms,
    pub running: bool,
    #[serde(default)]
    pub note: Option<String>,
}

/// Entries clipped to `bounds` (open entries end at `now`), sorted by start.
pub fn day_segments(entries: &[Entry], bounds: (Ms, Ms), now: Ms) -> Vec<Seg> {
    let mut segs: Vec<Seg> = entries
        .iter()
        .filter_map(|e| {
            let end = e.end.unwrap_or(now);
            let start = e.start.max(bounds.0);
            let end = end.min(bounds.1);
            (end > start).then_some(Seg {
                entry_id: e.id,
                project_id: e.project_id,
                start,
                end,
                running: e.end.is_none(),
                note: e.note.clone(),
            })
        })
        .collect();
    segs.sort_by_key(|s| (s.start, s.entry_id));
    segs
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDay {
    pub normal_ms: i64,
    pub extra_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoLunch {
    pub project_id: i64,
    pub ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LunchStatus {
    Marked,
    Auto,
    Pending,
    NoneRunning,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCalc {
    pub day: NaiveDate,
    pub segments: Vec<Seg>,
    pub per_project: BTreeMap<i64, ProjectDay>,
    pub lunch: Option<Lunch>,
    pub auto_lunch: Option<AutoLunch>,
    pub lunch_status: LunchStatus,
    pub jornada_ms: i64,
    pub is_holiday: bool,
}

pub fn day_calc<Tz: TimeZone>(
    tz: &Tz,
    day: NaiveDate,
    today: NaiveDate,
    entries: &[Entry],
    lunches: &[Lunch],
    s: &Settings,
    now: Ms,
) -> DayCalc {
    let segments = day_segments(entries, day_bounds(tz, day), now);
    let mut lens: Vec<i64> = segments.iter().map(|g| g.end - g.start).collect();

    let lunch = lunches.iter().find(|l| l.day == day).cloned();
    let mut auto_lunch = None;
    let lunch_status = if lunch.is_some() {
        LunchStatus::Marked
    } else if s.lunch_min == 0 {
        LunchStatus::Disabled
    } else if day >= today {
        LunchStatus::Pending
    } else {
        let reference = at(tz, day, s.lunch_ref);
        match segments
            .iter()
            .position(|g| g.start <= reference && reference < g.end)
        {
            Some(i) => {
                let ms = lens[i].min(s.lunch_min as i64 * MIN_MS);
                lens[i] -= ms;
                auto_lunch = Some(AutoLunch { project_id: segments[i].project_id, ms });
                LunchStatus::Auto
            }
            None => LunchStatus::NoneRunning,
        }
    };

    let jornada_ms = s.jornada_ms(day);
    let mut per_project: BTreeMap<i64, ProjectDay> = BTreeMap::new();
    let mut acc = 0i64;
    for (g, len) in segments.iter().zip(&lens) {
        let normal = (jornada_ms - acc).clamp(0, *len);
        let entry = per_project.entry(g.project_id).or_default();
        entry.normal_ms += normal;
        entry.extra_ms += len - normal;
        acc += len;
    }

    DayCalc {
        day,
        segments,
        per_project,
        lunch,
        auto_lunch,
        lunch_status,
        jornada_ms,
        is_holiday: s.holidays.contains(&day),
    }
}

/// Nearest multiple of `rounding_min` minutes, halves round up. 0 = identity.
pub fn round_ms(ms: i64, rounding_min: u32) -> i64 {
    if rounding_min == 0 {
        return ms;
    }
    let step = rounding_min as i64 * MIN_MS;
    (ms + step / 2).div_euclid(step) * step
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Grouping {
    Project,
    Client,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    pub total_ms: i64,
    pub extra_ms: i64,
}

impl Cell {
    fn add(&mut self, o: Cell) {
        self.total_ms += o.total_ms;
        self.extra_ms += o.extra_ms;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RowKind {
    ClientHeader,
    Data,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRow {
    pub kind: RowKind,
    pub label: String,
    pub color: Option<String>,
    pub project_count: u32,
    pub cells: [Cell; 7],
    pub total: Cell,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekReport {
    pub week_start: NaiveDate,
    pub days: [NaiveDate; 7],
    pub holidays: [bool; 7],
    pub rows: Vec<ReportRow>,
    pub col_totals: [Cell; 7],
    pub total: Cell,
    pub expected_ms: i64,
    pub rounding_min: u32,
    pub grouping: Grouping,
}

fn sum_cells(rows: &[&[Cell; 7]]) -> ([Cell; 7], Cell) {
    let mut cells = [Cell::default(); 7];
    let mut total = Cell::default();
    for r in rows {
        for (i, c) in r.iter().enumerate() {
            cells[i].add(*c);
            total.add(*c);
        }
    }
    (cells, total)
}

#[allow(clippy::too_many_arguments)]
pub fn week_report<Tz: TimeZone>(
    tz: &Tz,
    week_start: NaiveDate,
    today: NaiveDate,
    projects: &[Project],
    entries: &[Entry],
    lunches: &[Lunch],
    s: &Settings,
    now: Ms,
    grouping: Grouping,
) -> WeekReport {
    let days: [NaiveDate; 7] = std::array::from_fn(|i| week_start + Duration::days(i as i64));
    let calcs: Vec<DayCalc> = days
        .iter()
        .map(|d| day_calc(tz, *d, today, entries, lunches, s, now))
        .collect();

    // Per project: rounded cells, only for projects with any time in the week.
    let mut per_project: Vec<(&Project, [Cell; 7])> = Vec::new();
    for p in projects {
        let mut cells = [Cell::default(); 7];
        let mut any = false;
        for (i, c) in calcs.iter().enumerate() {
            if let Some(pd) = c.per_project.get(&p.id) {
                if pd.normal_ms + pd.extra_ms > 0 {
                    any = true;
                }
                let extra = round_ms(pd.extra_ms, s.rounding_min);
                cells[i] = Cell {
                    total_ms: round_ms(pd.normal_ms, s.rounding_min) + extra,
                    extra_ms: extra,
                };
            }
        }
        if any {
            per_project.push((p, cells));
        }
    }
    // The exact client breaks ties before the name, so "Acme" and "acme" never interleave
    // (grouping below splits on exact client equality).
    per_project.sort_by(|a, b| {
        let key = |p: &Project| (p.client.to_lowercase(), p.client.clone(), p.name.to_lowercase(), p.name.clone());
        key(a.0).cmp(&key(b.0))
    });

    let mut rows = Vec::new();
    let mut i = 0;
    while i < per_project.len() {
        let client = per_project[i].0.client.as_str();
        let mut j = i;
        while j < per_project.len() && per_project[j].0.client == client {
            j += 1;
        }
        let group = &per_project[i..j];
        let refs: Vec<&[Cell; 7]> = group.iter().map(|(_, c)| c).collect();
        match grouping {
            Grouping::Project => {
                rows.push(ReportRow {
                    kind: RowKind::ClientHeader,
                    label: client.to_string(),
                    color: None,
                    project_count: 0,
                    cells: [Cell::default(); 7],
                    total: Cell::default(),
                });
                for (p, cells) in group {
                    let (_, total) = sum_cells(&[cells]);
                    rows.push(ReportRow {
                        kind: RowKind::Data,
                        label: p.name.clone(),
                        color: Some(p.color.clone()),
                        project_count: 1,
                        cells: *cells,
                        total,
                    });
                }
            }
            Grouping::Client => {
                let (cells, total) = sum_cells(&refs);
                rows.push(ReportRow {
                    kind: RowKind::Data,
                    label: client.to_string(),
                    color: None,
                    project_count: group.len() as u32,
                    cells,
                    total,
                });
            }
        }
        i = j;
    }

    let data: Vec<&[Cell; 7]> = per_project.iter().map(|(_, c)| c).collect();
    let (col_totals, total) = sum_cells(&data);

    WeekReport {
        week_start,
        days,
        holidays: std::array::from_fn(|i| s.holidays.contains(&days[i])),
        rows,
        col_totals,
        total,
        expected_ms: days.iter().map(|d| s.jornada_ms(*d)).sum(),
        rounding_min: s.rounding_min,
        grouping,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, NaiveTime};

    const H: i64 = 3_600_000;
    const M: i64 = 60_000;

    fn tz() -> FixedOffset {
        FixedOffset::west_opt(3 * 3600).unwrap()
    }
    fn d(y: i32, m: u32, dd: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, dd).unwrap()
    }
    /// Wednesday.
    fn day() -> NaiveDate {
        d(2026, 11, 11)
    }
    fn t(s: &str) -> Ms {
        t_on(day(), s)
    }
    fn t_on(day: NaiveDate, s: &str) -> Ms {
        let nt = NaiveTime::parse_from_str(s, "%H:%M").unwrap();
        at(&tz(), day, nt)
    }
    fn e(id: i64, p: i64, s: Ms, en: Option<Ms>) -> Entry {
        Entry { id, project_id: p, start: s, end: en, note: None }
    }
    fn lunch(day: NaiveDate, s: &str, en: &str) -> Lunch {
        Lunch { day, start: t_on(day, s), end: t_on(day, en) }
    }
    fn today_after() -> NaiveDate {
        d(2026, 11, 20)
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

    #[test]
    fn overtime_goes_to_project_running_after_jornada() {
        let entries = vec![
            e(1, 1, t("08:50"), Some(t("12:00"))),
            e(2, 2, t("13:00"), Some(t("15:00"))),
            e(3, 3, t("15:00"), Some(t("19:20"))),
        ];
        let l = vec![lunch(day(), "12:00", "13:00")];
        let c = day_calc(&tz(), day(), today_after(), &entries, &l, &Settings::default(), t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::Marked);
        assert_eq!(c.per_project[&1], ProjectDay { normal_ms: 3 * H + 10 * M, extra_ms: 0 });
        assert_eq!(c.per_project[&2], ProjectDay { normal_ms: 2 * H, extra_ms: 0 });
        assert_eq!(c.per_project[&3], ProjectDay { normal_ms: 2 * H + 50 * M, extra_ms: 90 * M });
        assert_eq!(c.jornada_ms, 8 * H);
        assert!(!c.is_holiday);
    }

    fn lunch_entries() -> Vec<Entry> {
        vec![
            e(1, 1, t("09:10"), Some(t("17:40"))),
            e(2, 2, t("17:40"), Some(t("18:00"))),
        ]
    }

    #[test]
    fn auto_lunch_deducts_from_project_running_at_ref() {
        let c = day_calc(&tz(), day(), today_after(), &lunch_entries(), &[], &Settings::default(), t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::Auto);
        assert_eq!(c.auto_lunch, Some(AutoLunch { project_id: 1, ms: H }));
        let a = c.per_project[&1];
        assert_eq!(a.normal_ms + a.extra_ms, 7 * H + 30 * M);
        assert_eq!(c.lunch, None);
    }

    #[test]
    fn no_auto_lunch_today() {
        let c = day_calc(&tz(), day(), day(), &lunch_entries(), &[], &Settings::default(), t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::Pending);
        assert_eq!(c.auto_lunch, None);
        let a = c.per_project[&1];
        assert_eq!(a.normal_ms + a.extra_ms, 8 * H + 30 * M);
    }

    #[test]
    fn no_auto_lunch_when_nothing_running_at_ref() {
        let entries = vec![
            e(1, 1, t("09:00"), Some(t("11:00"))),
            e(2, 2, t("13:00"), Some(t("18:00"))),
        ];
        let c = day_calc(&tz(), day(), today_after(), &entries, &[], &Settings::default(), t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::NoneRunning);
        assert_eq!(c.auto_lunch, None);
        assert_eq!(c.per_project[&1].normal_ms, 2 * H);
        assert_eq!(c.per_project[&2].normal_ms + c.per_project[&2].extra_ms, 5 * H);
    }

    #[test]
    fn marked_lunch_prevents_auto() {
        let l = vec![lunch(day(), "12:00", "12:45")];
        let c = day_calc(&tz(), day(), today_after(), &lunch_entries(), &l, &Settings::default(), t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::Marked);
        assert_eq!(c.auto_lunch, None);
        assert_eq!(c.lunch, Some(l[0].clone()));
        let a = c.per_project[&1];
        assert_eq!(a.normal_ms + a.extra_ms, 8 * H + 30 * M);
    }

    #[test]
    fn lunch_disabled_when_zero_minutes() {
        let mut s = Settings::default();
        s.lunch_min = 0;
        let c = day_calc(&tz(), day(), today_after(), &lunch_entries(), &[], &s, t("23:00"));
        assert_eq!(c.lunch_status, LunchStatus::Disabled);
        assert_eq!(c.auto_lunch, None);
    }

    #[test]
    fn auto_lunch_capped_by_segment_length() {
        let entries = vec![e(1, 1, t("11:50"), Some(t("12:20")))];
        let c = day_calc(&tz(), day(), today_after(), &entries, &[], &Settings::default(), t("23:00"));
        assert_eq!(c.auto_lunch, Some(AutoLunch { project_id: 1, ms: 30 * M }));
        assert_eq!(c.per_project.get(&1).map(|p| p.normal_ms + p.extra_ms), Some(0));
    }

    #[test]
    fn zero_jornada_all_extra() {
        let sat = d(2026, 11, 14);
        let entries = vec![e(1, 1, t_on(sat, "10:00"), Some(t_on(sat, "12:30")))];
        let mut s0 = Settings::default();
        s0.lunch_min = 0;
        let c = day_calc(&tz(), sat, today_after(), &entries, &[], &s0, t_on(sat, "23:00"));
        assert_eq!(c.jornada_ms, 0);
        assert_eq!(c.per_project[&1], ProjectDay { normal_ms: 0, extra_ms: 2 * H + 30 * M });

        let mon = d(2026, 11, 9);
        let mut s = Settings::default();
        s.lunch_min = 0;
        s.holidays.push(mon);
        let entries = vec![e(1, 1, t_on(mon, "10:00"), Some(t_on(mon, "12:30")))];
        let c = day_calc(&tz(), mon, today_after(), &entries, &[], &s, t_on(mon, "23:00"));
        assert!(c.is_holiday);
        assert_eq!(c.per_project[&1], ProjectDay { normal_ms: 0, extra_ms: 2 * H + 30 * M });
    }

    #[test]
    fn midnight_split() {
        let d1 = day();
        let d2 = d(2026, 11, 12);
        let entries = vec![e(1, 1, t_on(d1, "22:00"), Some(t_on(d2, "01:30")))];
        let mut s = Settings::default();
        s.lunch_min = 0;
        let c1 = day_calc(&tz(), d1, today_after(), &entries, &[], &s, t_on(d2, "09:00"));
        let c2 = day_calc(&tz(), d2, today_after(), &entries, &[], &s, t_on(d2, "09:00"));
        assert_eq!(c1.per_project[&1].normal_ms, 2 * H);
        assert_eq!(c2.per_project[&1].normal_ms, 90 * M);
        assert_eq!(c1.segments.len(), 1);
        assert_eq!(c2.segments[0].start, c2_bounds_start());
    }
    fn c2_bounds_start() -> Ms {
        day_bounds(&tz(), d(2026, 11, 12)).0
    }

    #[test]
    fn running_entry_counts_until_now() {
        let entries = vec![e(1, 1, t("08:00"), None)];
        let mut s = Settings::default();
        s.lunch_min = 0;
        let c = day_calc(&tz(), day(), day(), &entries, &[], &s, t("10:00"));
        assert_eq!(c.per_project[&1].normal_ms, 2 * H);
        assert!(c.segments[0].running);
        assert_eq!(c.segments[0].end, t("10:00"));
    }

    #[test]
    fn segments_are_sorted_and_clipped() {
        let entries = vec![
            e(2, 2, t("10:00"), Some(t("11:00"))),
            e(1, 1, t_on(d(2026, 11, 10), "23:00"), Some(t("01:00"))),
        ];
        let segs = day_segments(&entries, day_bounds(&tz(), day()), t("23:00"));
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].entry_id, 1);
        assert_eq!(segs[0].start, day_bounds(&tz(), day()).0);
        assert_eq!(segs[0].end, t("01:00"));
        assert_eq!(segs[1].entry_id, 2);
    }

    #[test]
    fn round_ms_cases() {
        assert_eq!(round_ms(130 * M, 15), 135 * M);
        assert_eq!(round_ms(127 * M, 15), 120 * M);
        assert_eq!(round_ms(7 * M + 30_000, 15), 15 * M);
        assert_eq!(round_ms(130 * M, 30), 120 * M);
        assert_eq!(round_ms(12345, 0), 12345);
        assert_eq!(round_ms(0, 15), 0);
    }

    fn mon() -> NaiveDate {
        d(2026, 11, 9)
    }

    #[test]
    fn week_client_grouping_sums_rounded_projects() {
        let mut s = Settings::default();
        s.rounding_min = 15;
        s.lunch_min = 0;
        let projects = vec![proj(1, "P1", "X"), proj(2, "P2", "X")];
        let entries = vec![
            e(1, 1, t_on(mon(), "09:00"), Some(t_on(mon(), "10:07"))),
            e(2, 2, t_on(mon(), "10:07"), Some(t_on(mon(), "11:14"))),
        ];
        let r = week_report(&tz(), mon(), today_after(), &projects, &entries, &[], &s, t("23:00"), Grouping::Project);
        // header + 2 data rows
        assert_eq!(r.rows.len(), 3);
        assert_eq!(r.rows[0].kind, RowKind::ClientHeader);
        assert_eq!(r.rows[0].project_count, 0);
        assert_eq!(r.rows[0].total, Cell { total_ms: 0, extra_ms: 0 });
        assert_eq!(r.rows[1].cells[0].total_ms, H);
        assert_eq!(r.rows[2].cells[0].total_ms, H);

        let r = week_report(&tz(), mon(), today_after(), &projects, &entries, &[], &s, t("23:00"), Grouping::Client);
        assert_eq!(r.rows.len(), 1);
        assert_eq!(r.rows[0].kind, RowKind::Data);
        assert_eq!(r.rows[0].label, "X");
        assert_eq!(r.rows[0].project_count, 2);
        assert_eq!(r.rows[0].cells[0].total_ms, 2 * H);
        assert_eq!(r.col_totals[0].total_ms, 2 * H);
        assert_eq!(r.total.total_ms, 2 * H);
    }

    #[test]
    fn week_totals_and_expected() {
        let s = Settings::default();
        let projects = vec![proj(1, "Zed", "B"), proj(2, "Alpha", "A"), proj(3, "Idle", "A"), proj(4, "Beta", "A")];
        let tue = d(2026, 11, 10);
        let entries = vec![
            e(1, 1, t_on(mon(), "09:00"), Some(t_on(mon(), "11:00"))),
            e(2, 2, t_on(tue, "09:00"), Some(t_on(tue, "20:00"))),
            e(3, 4, t_on(tue, "20:00"), Some(t_on(tue, "21:00"))),
            e(4, 2, t_on(mon(), "13:00"), Some(t_on(mon(), "14:00"))),
        ];
        let r = week_report(&tz(), mon(), today_after(), &projects, &entries, &[], &s, t("23:00"), Grouping::Project);
        assert_eq!(r.week_start, mon());
        assert_eq!(r.days[6], d(2026, 11, 15));
        assert_eq!(r.expected_ms, 40 * H);
        assert_eq!(r.rounding_min, 0);
        assert_eq!(r.grouping, Grouping::Project);
        let labels: Vec<_> = r.rows.iter().map(|x| (x.kind, x.label.as_str())).collect();
        assert_eq!(
            labels,
            vec![
                (RowKind::ClientHeader, "A"),
                (RowKind::Data, "Alpha"),
                (RowKind::Data, "Beta"),
                (RowKind::ClientHeader, "B"),
                (RowKind::Data, "Zed"),
            ]
        );
        let data: Vec<_> = r.rows.iter().filter(|x| x.kind == RowKind::Data).collect();
        let sum: i64 = data.iter().map(|x| x.total.total_ms).sum();
        assert_eq!(r.total.total_ms, sum);
        let col_sum: i64 = r.col_totals.iter().map(|c| c.total_ms).sum();
        assert_eq!(col_sum, sum);
        let extra_sum: i64 = data.iter().map(|x| x.total.extra_ms).sum();
        assert_eq!(r.total.extra_ms, extra_sum);
        // Tuesday: Alpha 09:00-20:00 = 11h minus 1h auto lunch = 10h => 8h normal + 2h extra; Beta 1h extra.
        assert_eq!(r.col_totals[1], Cell { total_ms: 11 * H, extra_ms: 3 * H });
        assert_eq!(r.rows[1].cells[1], Cell { total_ms: 10 * H, extra_ms: 2 * H });
        assert_eq!(r.col_totals[0].total_ms, 3 * H);
        assert_eq!(r.holidays, [false; 7]);
    }

    #[test]
    fn case_variant_clients_stay_grouped() {
        let s = Settings::default();
        let projects = vec![proj(1, "Alpha", "Acme"), proj(2, "Beta", "acme"), proj(3, "Gamma", "Acme")];
        let entries = vec![
            e(1, 1, t_on(mon(), "09:00"), Some(t_on(mon(), "10:00"))),
            e(2, 2, t_on(mon(), "10:00"), Some(t_on(mon(), "11:00"))),
            e(3, 3, t_on(mon(), "11:00"), Some(t_on(mon(), "12:00"))),
        ];
        let r = week_report(&tz(), mon(), today_after(), &projects, &entries, &[], &s, t("23:00"), Grouping::Project);
        let labels: Vec<_> = r.rows.iter().map(|x| (x.kind, x.label.as_str())).collect();
        assert_eq!(
            labels,
            vec![
                (RowKind::ClientHeader, "Acme"),
                (RowKind::Data, "Alpha"),
                (RowKind::Data, "Gamma"),
                (RowKind::ClientHeader, "acme"),
                (RowKind::Data, "Beta"),
            ]
        );
    }

    #[test]
    fn week_marks_holidays() {
        let mut s = Settings::default();
        s.holidays.push(d(2026, 11, 11));
        let r = week_report(&tz(), mon(), today_after(), &[], &[], &[], &s, t("23:00"), Grouping::Client);
        assert_eq!(r.holidays, [false, false, true, false, false, false, false]);
        assert_eq!(r.expected_ms, 32 * H);
        assert!(r.rows.is_empty());
    }

    #[test]
    fn serde_enum_names() {
        assert_eq!(serde_json::to_string(&LunchStatus::NoneRunning).unwrap(), "\"noneRunning\"");
        assert_eq!(serde_json::to_string(&RowKind::ClientHeader).unwrap(), "\"clientHeader\"");
        assert_eq!(serde_json::to_string(&Grouping::Client).unwrap(), "\"client\"");
    }
}
