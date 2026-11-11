use chrono::{FixedOffset, NaiveDate, NaiveTime};

use super::*;
use crate::domain::time::at;

const MIN: i64 = 60_000;

fn tz() -> FixedOffset {
    FixedOffset::west_opt(3 * 3600).unwrap()
}

/// Wednesday.
fn day() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 11, 11).unwrap()
}

fn t(h: u32, m: u32) -> Ms {
    at(&tz(), day(), NaiveTime::from_hms_opt(h, m, 0).unwrap())
}

fn setup() -> (Tracker, Project, Project) {
    let mut tr = Tracker::new(Db::open_in_memory().unwrap());
    let a = tr.create_project("Alpha", "Acme", "#4f86ff").unwrap();
    let b = tr.create_project("Beta", "Acme", "#a8c4ff").unwrap();
    (tr, a, b)
}

fn all_entries(tr: &Tracker) -> Vec<Entry> {
    repo::entries_between(&tr.db, i64::MIN, i64::MAX).unwrap()
}

fn e(id: i64, pid: i64, start: Ms, end: Option<Ms>) -> Entry {
    Entry { id, project_id: pid, start, end }
}

fn snap(tr: &Tracker, now: Ms) -> TrackerSnapshot {
    tr.snapshot(&tz(), now).unwrap()
}

#[test]
fn switch_closes_previous_and_starts_new_session() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.switch_to(b.id, t(10, 0)).unwrap();
    let es = all_entries(&tr);
    assert_eq!(es.len(), 2);
    assert_eq!((es[0].project_id, es[0].start, es[0].end), (a.id, t(9, 0), Some(t(10, 0))));
    assert_eq!((es[1].project_id, es[1].start, es[1].end), (b.id, t(10, 0), None));
    let s = snap(&tr, t(10, 30));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_project.as_ref().map(|p| p.id), Some(b.id));
    assert_eq!(s.session_ms, 30 * MIN);
    assert_eq!(s.running_since, Some(t(10, 0)));
    assert_eq!(s.today_ms, 90 * MIN);
    assert_eq!(s.today_jornada_ms, 8 * 60 * MIN);
}

#[test]
fn switch_from_paused_starts_new_session() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    tr.switch_to(b.id, t(10, 0)).unwrap();
    let s = snap(&tr, t(10, 10));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_ms, 10 * MIN);
}

#[test]
fn switch_to_unknown_project_is_not_found() {
    let (mut tr, _, _) = setup();
    assert!(matches!(tr.switch_to(999, t(9, 0)), Err(TrackerError::NotFound)));
    assert!(all_entries(&tr).is_empty());
}

#[test]
fn pause_resume_keeps_session_time() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(10, 0)).unwrap();
    tr.pause(t(10, 30)).unwrap();
    let s = snap(&tr, t(10, 40));
    assert_eq!(s.status, ClockStatus::Paused);
    assert_eq!(s.session_ms, 30 * MIN);
    assert_eq!(s.session_project.as_ref().map(|p| p.id), Some(a.id));
    assert_eq!(s.running_since, None);
    tr.resume(t(10, 45)).unwrap();
    let s = snap(&tr, t(11, 0));
    assert_eq!(s.session_ms, 45 * MIN);
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(all_entries(&tr).len(), 2);
}

#[test]
fn undo_resume_drops_question_about_the_undone_entry() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    tr.resume(t(10, 0)).unwrap();
    assert!(tr.begin_absence(&tz(), t(10, 5), t(10, 40), AbsenceReason::Idle).unwrap());
    tr.undo().unwrap();
    let s = snap(&tr, t(10, 40));
    assert_eq!(s.status, ClockStatus::Paused);
    assert_eq!(s.pending_absence, None);
}

#[test]
fn pause_and_resume_without_session_fail() {
    let (mut tr, _, _) = setup();
    assert!(matches!(tr.pause(t(9, 0)), Err(TrackerError::NoSession)));
    assert!(matches!(tr.resume(t(9, 0)), Err(TrackerError::NoSession)));
}

#[test]
fn stop_is_undoable() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.stop(t(10, 0)).unwrap();
    let s = snap(&tr, t(10, 0));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.session_project, None);
    assert!(s.can_undo);
    assert_eq!(all_entries(&tr)[0].end, Some(t(10, 0)));

    assert!(tr.undo().unwrap());
    let s = snap(&tr, t(10, 30));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_ms, 90 * MIN);
    assert!(!s.can_undo);
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    assert!(!tr.undo().unwrap());
}

#[test]
fn switch_is_undoable() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    let before = all_entries(&tr);
    tr.switch_to(b.id, t(10, 0)).unwrap();
    tr.undo().unwrap();
    assert_eq!(all_entries(&tr), before);
    let s = snap(&tr, t(10, 0));
    assert_eq!(s.status, ClockStatus::Paused);
    assert_eq!(s.session_ms, 30 * MIN);
}

/// Running A since 09:00, absence 12:05–13:10 noticed at 13:10.
fn with_absence() -> (Tracker, Project, Project) {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr.begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Idle).unwrap());
    let s = snap(&tr, t(13, 10));
    let p = s.pending_absence.unwrap();
    assert_eq!((p.start, p.end, p.project_id), (t(12, 5), t(13, 10), a.id));
    (tr, a, b)
}

#[test]
fn absence_discount() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(13, 10)).unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![e(1, a.id, t(9, 0), Some(t(12, 5))), e(2, a.id, t(13, 10), None)]
    );
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_project.map(|p| p.id), Some(a.id));
    assert_eq!(s.session_ms, (3 * 60 + 5 + 50) * MIN);
    assert_eq!(s.pending_absence, None);
    assert!(repo::lunches_between(&tr.db, day(), day()).unwrap().is_empty());
}

#[test]
fn absence_discount_undo_restores_everything() {
    let (mut tr, _, _) = with_absence();
    let before = all_entries(&tr);
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(13, 10)).unwrap();
    assert!(tr.undo().unwrap());
    assert_eq!(all_entries(&tr), before);
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.session_ms, 5 * 60 * MIN);
    assert!(s.pending_absence.is_some(), "undo brings the question back");
}

#[test]
fn absence_lunch_marks_lunch() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10)).unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![e(1, a.id, t(9, 0), Some(t(12, 5))), e(2, a.id, t(13, 10), None)]
    );
    let l = repo::lunches_between(&tr.db, day(), day()).unwrap();
    assert_eq!(l, vec![Lunch { day: day(), start: t(12, 5), end: t(13, 10) }]);
    tr.undo().unwrap();
    assert!(repo::lunches_between(&tr.db, day(), day()).unwrap().is_empty());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn absence_lunch_replaces_existing_lunch_and_undo_restores_it() {
    let (mut tr, _, _) = with_absence();
    let old = Lunch { day: day(), start: t(11, 0), end: t(11, 30) };
    repo::upsert_lunch(&tr.db, &old).unwrap();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10)).unwrap();
    tr.undo().unwrap();
    assert_eq!(repo::lunches_between(&tr.db, day(), day()).unwrap(), vec![old]);
}

#[test]
fn absence_keep_changes_nothing() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Keep, t(13, 10)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.session_ms, 5 * 60 * MIN);
    assert_eq!(s.pending_absence, None);
    assert!(s.can_undo);
    tr.undo().unwrap();
    assert!(snap(&tr, t(14, 0)).pending_absence.is_some());
}

#[test]
fn absence_move_to_other_project() {
    let (mut tr, a, b) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::MoveTo(b.id), t(13, 10)).unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![
            e(1, a.id, t(9, 0), Some(t(12, 5))),
            e(2, b.id, t(12, 5), Some(t(13, 10))),
            e(3, a.id, t(13, 10), None),
        ]
    );
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.session_project.map(|p| p.id), Some(a.id));
    assert_eq!(s.session_ms, (3 * 60 + 5 + 50) * MIN);
    assert_eq!(s.today_ms, 5 * 60 * MIN);
    tr.undo().unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn absence_move_to_unknown_project_leaves_data_and_question() {
    let (mut tr, a, _) = with_absence();
    assert!(matches!(
        tr.resolve_absence(&tz(), AbsenceResolution::MoveTo(999), t(13, 10)),
        Err(TrackerError::NotFound)
    ));
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    assert!(snap(&tr, t(13, 10)).pending_absence.is_some());
}

#[test]
fn absence_ignored_when_paused_or_idle() {
    let (mut tr, a, _) = setup();
    assert!(!tr.begin_absence(&tz(), t(9, 0), t(10, 0), AbsenceReason::Idle).unwrap());
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    assert!(!tr.begin_absence(&tz(), t(10, 0), t(11, 0), AbsenceReason::Sleep).unwrap());
    assert_eq!(snap(&tr, t(11, 0)).pending_absence, None);
}

#[test]
fn sleep_with_stop_on_sleep_closes_at_sleep_start() {
    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(!tr.begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Sleep).unwrap());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(12, 5)))]);
    let s = snap(&tr, t(13, 10));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.pending_absence, None);
    assert!(!s.can_undo);
    assert!(s.notice.unwrap().contains("12:05"));
}

#[test]
fn idle_absence_with_stop_on_sleep_still_asks() {
    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr.begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Idle).unwrap());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn reconcile_closes_at_heartbeat_after_two_minutes() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.heartbeat(t(10, 0)).unwrap();
    // Simulate a restart.
    let mut tr = Tracker::new(tr.db);
    assert_eq!(tr.reconcile_on_startup(&tz(), t(10, 3)).unwrap(), Some(t(10, 0)));
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(10, 0)))]);
    let s = snap(&tr, t(10, 3));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.notice.as_deref(), Some("O relógio foi parado às 10:00, quando o app fechou"));
    assert!(s.can_undo);
    tr.undo().unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    let s = snap(&tr, t(10, 5));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_ms, 65 * MIN);
    assert_eq!(s.notice, None);
}

#[test]
fn reconcile_keeps_running_under_two_minutes() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.heartbeat(t(10, 0)).unwrap();
    let mut tr = Tracker::new(tr.db);
    assert_eq!(tr.reconcile_on_startup(&tz(), t(10, 0) + 2 * MIN).unwrap(), None);
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    let s = snap(&tr, t(10, 3));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.notice, None);
}

#[test]
fn reconcile_never_closes_before_entry_start() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(8, 0)).unwrap();
    tr.heartbeat(t(8, 30)).unwrap();
    tr.switch_to(b.id, t(9, 0)).unwrap();
    // A stale heartbeat older than the open entry (e.g. crash before the first tick).
    repo::set_meta(&tr.db, META_HEARTBEAT, &t(8, 30)).unwrap();
    let mut tr = Tracker::new(tr.db);
    assert_eq!(tr.reconcile_on_startup(&tz(), t(12, 0)).unwrap(), Some(t(9, 0)));
    assert_eq!(all_entries(&tr)[1], e(2, b.id, t(9, 0), Some(t(9, 0))));
}

#[test]
fn quit_with_pending_absence_closes_at_absence_start() {
    let (mut tr, a, _) = with_absence();
    tr.quit(t(13, 12)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(12, 5)))]);
    let s = snap(&tr, t(13, 12));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.pending_absence, None);
    assert!(!s.can_undo);
}

#[test]
fn quit_closes_at_now_and_ends_paused_session() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.quit(t(10, 0)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(10, 0)))]);
    tr.switch_to(b.id, t(11, 0)).unwrap();
    tr.pause(t(11, 30)).unwrap();
    tr.quit(t(12, 0)).unwrap();
    assert_eq!(snap(&tr, t(12, 0)).status, ClockStatus::Idle);
}

#[test]
fn update_entry_rejects_inverted_range() {
    let (mut tr, a, _) = setup();
    let en = tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    let r = tr.update_entry(en.id, Some(t(11, 0)), None, None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::InvalidRange)));
    assert_eq!(r.unwrap_err().to_string(), "O início precisa ser antes do fim");
    let r = tr.update_entry(en.id, None, Some(t(9, 0)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::InvalidRange)));
    assert!(matches!(
        tr.add_entry(a.id, t(10, 0), t(9, 0), t(12, 0)),
        Err(TrackerError::InvalidRange)
    ));
    assert_eq!(all_entries(&tr), vec![en]);
}

#[test]
fn update_entry_rejects_overlap() {
    let (mut tr, a, b) = setup();
    let x = tr.add_entry(a.id, t(8, 0), t(9, 0), t(12, 0)).unwrap();
    let y = tr.add_entry(b.id, t(9, 0), t(10, 0), t(12, 0)).unwrap(); // touching is allowed
    tr.switch_to(a.id, t(11, 0)).unwrap();
    let before = all_entries(&tr);
    let r = tr.update_entry(y.id, Some(t(8, 30)), None, None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::Overlap)));
    assert_eq!(r.unwrap_err().to_string(), "Esse horário sobrepõe outro registro");
    // The open entry counts as ending at `now`.
    let r = tr.update_entry(y.id, None, Some(t(11, 30)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::Overlap)));
    assert!(matches!(
        tr.add_entry(b.id, t(11, 50), t(11, 55), t(12, 0)),
        Err(TrackerError::Overlap)
    ));
    assert_eq!(all_entries(&tr), before);
    // A valid edit works and is undoable.
    tr.update_entry(x.id, Some(t(7, 30)), None, Some(b.id), t(12, 0)).unwrap();
    assert_eq!(repo::get_entry(&tr.db, x.id).unwrap(), Some(e(x.id, b.id, t(7, 30), Some(t(9, 0)))));
    tr.undo().unwrap();
    assert_eq!(all_entries(&tr), before);
}

#[test]
fn entry_ops_on_missing_id_are_not_found() {
    let (mut tr, _, _) = setup();
    assert!(matches!(
        tr.update_entry(42, Some(t(9, 0)), None, None, t(12, 0)),
        Err(TrackerError::NotFound)
    ));
    assert!(matches!(tr.delete_entry(42), Err(TrackerError::NotFound)));
    let ghost = Project { id: 42, name: "x".into(), client: "y".into(), color: "#fff".into(), archived: false };
    assert!(matches!(tr.update_project(ghost), Err(TrackerError::NotFound)));
}

#[test]
fn delete_running_entry_ends_session_and_undo_restores() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.delete_entry(1).unwrap();
    assert!(all_entries(&tr).is_empty());
    assert_eq!(snap(&tr, t(10, 0)).status, ClockStatus::Idle);
    tr.undo().unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    assert_eq!(snap(&tr, t(10, 0)).session_ms, 60 * MIN);
}

#[test]
fn unmark_lunch_is_undoable() {
    let (mut tr, _, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10)).unwrap();
    tr.unmark_lunch(day()).unwrap();
    assert!(repo::lunches_between(&tr.db, day(), day()).unwrap().is_empty());
    tr.undo().unwrap();
    assert_eq!(repo::lunches_between(&tr.db, day(), day()).unwrap().len(), 1);
}

#[test]
fn recents_order_and_shortcuts() {
    let mut tr = Tracker::new(Db::open_in_memory().unwrap());
    let mk = |tr: &mut Tracker, n: &str| tr.create_project(n, "Acme", "#fff").unwrap();
    let pa = mk(&mut tr, "Alpha");
    let pb = mk(&mut tr, "Beta");
    let pc = mk(&mut tr, "Gamma");
    let pd = mk(&mut tr, "Delta");
    let mut pf = mk(&mut tr, "Archived");
    let pz = mk(&mut tr, "Zeta");
    pf.archived = true;
    tr.update_project(pf.clone()).unwrap();

    // Only one used project: padded with other active projects by name.
    tr.add_entry(pc.id, t(8, 0), t(9, 0), t(9, 0)).unwrap();
    let r: Vec<i64> = snap(&tr, t(9, 0)).recents.iter().map(|r| r.project.id).collect();
    assert_eq!(r, vec![pc.id, pa.id, pb.id, pd.id]);

    tr.add_entry(pa.id, t(9, 0), t(10, 0), t(13, 0)).unwrap();
    tr.add_entry(pb.id, t(10, 0), t(10, 30), t(13, 0)).unwrap();
    tr.add_entry(pf.id, t(10, 30), t(11, 0), t(13, 0)).unwrap();
    tr.add_entry(pz.id, t(11, 0), t(11, 30), t(13, 0)).unwrap();
    tr.switch_to(pa.id, t(12, 0)).unwrap();
    let s = snap(&tr, t(13, 0));
    let ids: Vec<i64> = s.recents.iter().map(|r| r.project.id).collect();
    assert_eq!(ids, vec![pa.id, pz.id, pb.id, pc.id]);
    let keys: Vec<Option<u8>> = s.recents.iter().map(|r| r.shortcut).collect();
    assert_eq!(keys, vec![Some(1), Some(2), Some(3), Some(4)]);
    assert_eq!(s.recents[0].today_ms, 2 * 60 * MIN);
    assert_eq!(s.recents[1].today_ms, 30 * MIN);
    assert_eq!(s.today_ms, (60 + 60 + 30 + 30 + 30 + 60) * MIN);
}

#[test]
fn snapshot_today_is_clipped_to_local_day() {
    let (mut tr, a, _) = setup();
    let prev = day().pred_opt().unwrap();
    let late = at(&tz(), prev, NaiveTime::from_hms_opt(23, 0, 0).unwrap());
    tr.switch_to(a.id, late).unwrap();
    let s = snap(&tr, t(1, 0));
    assert_eq!(s.today_ms, 60 * MIN);
    assert_eq!(s.session_ms, 120 * MIN);
}

#[test]
fn reports_delegate_to_calc() {
    let (mut tr, a, _) = setup();
    tr.add_entry(a.id, t(9, 0), t(19, 0), t(20, 0)).unwrap();
    let dc = tr.day_calc(&tz(), day(), t(20, 0)).unwrap();
    assert_eq!(dc.per_project[&a.id].normal_ms, 8 * 60 * MIN);
    assert_eq!(dc.per_project[&a.id].extra_ms, 2 * 60 * MIN);
    let wr = tr
        .week_report(&tz(), crate::domain::time::week_start(day()), t(20, 0), Grouping::Project)
        .unwrap();
    assert_eq!(wr.total.total_ms, 10 * 60 * MIN);
}

#[test]
fn serde_shapes() {
    use serde_json::{from_str, json, to_value};
    assert_eq!(to_value(AbsenceResolution::Discount).unwrap(), json!({"kind": "discount"}));
    assert_eq!(to_value(AbsenceResolution::Lunch).unwrap(), json!({"kind": "lunch"}));
    assert_eq!(to_value(AbsenceResolution::Keep).unwrap(), json!({"kind": "keep"}));
    assert_eq!(
        to_value(AbsenceResolution::MoveTo(7)).unwrap(),
        json!({"kind": "moveTo", "projectId": 7})
    );
    assert_eq!(
        from_str::<AbsenceResolution>(r#"{"kind":"moveTo","projectId":7}"#).unwrap(),
        AbsenceResolution::MoveTo(7)
    );
    assert_eq!(from_str::<AbsenceResolution>(r#"{"kind":"keep"}"#).unwrap(), AbsenceResolution::Keep);
    assert_eq!(to_value(ClockStatus::Paused).unwrap(), json!("paused"));
    assert_eq!(to_value(AbsenceReason::Sleep).unwrap(), json!("sleep"));
    let a = Absence { start: 1, end: 2, reason: AbsenceReason::Idle, project_id: 3 };
    assert_eq!(
        to_value(&a).unwrap(),
        json!({"start": 1, "end": 2, "reason": "idle", "projectId": 3})
    );
    assert_eq!(to_value(TrackerError::Overlap).unwrap(), json!("Esse horário sobrepõe outro registro"));
}
