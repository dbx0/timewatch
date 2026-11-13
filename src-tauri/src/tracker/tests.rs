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
    Entry {
        id,
        project_id: pid,
        start,
        end,
        note: None,
    }
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
    assert_eq!(
        (es[0].project_id, es[0].start, es[0].end),
        (a.id, t(9, 0), Some(t(10, 0)))
    );
    assert_eq!(
        (es[1].project_id, es[1].start, es[1].end),
        (b.id, t(10, 0), None)
    );
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
    assert!(matches!(
        tr.switch_to(999, t(9, 0)),
        Err(TrackerError::NotFound)
    ));
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
    assert!(tr
        .begin_absence(&tz(), t(10, 5), t(10, 40), AbsenceReason::Idle)
        .unwrap());
    tr.undo(t(16, 0)).unwrap();
    let s = snap(&tr, t(10, 40));
    assert_eq!(s.status, ClockStatus::Paused);
    assert_eq!(s.pending_absence, None);
}

fn heartbeat(tr: &Tracker) -> Option<Ms> {
    repo::get_meta(&tr.db, META_HEARTBEAT).unwrap()
}

#[test]
fn late_absence_answer_keeps_heartbeat_at_answer_time() {
    let (mut tr, a, _) = with_absence();
    tr.heartbeat(t(14, 59)).unwrap();
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(15, 0))
        .unwrap();
    assert!(heartbeat(&tr).unwrap() >= t(15, 0));
    // A crash right after answering must not close the entry back at 13:10.
    let mut tr = Tracker::new(tr.db);
    assert_eq!(tr.reconcile_on_startup(&tz(), t(15, 1)).unwrap(), None);
    assert_eq!(all_entries(&tr)[1], e(2, a.id, t(13, 10), None));
}

#[test]
fn opening_an_entry_never_moves_heartbeat_backwards() {
    let (mut tr, a, _) = setup();
    tr.add_entry(a.id, t(7, 0), t(8, 0), t(9, 0)).unwrap();
    repo::set_meta(&tr.db, META_HEARTBEAT, &t(10, 0)).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert_eq!(heartbeat(&tr), Some(t(10, 0)));
}

#[test]
fn undo_of_stop_refreshes_heartbeat_to_now() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.heartbeat(t(10, 0)).unwrap();
    tr.stop(t(10, 0)).unwrap();
    tr.undo(t(11, 0)).unwrap();
    assert_eq!(heartbeat(&tr), Some(t(11, 0)));
    let mut tr = Tracker::new(tr.db);
    assert_eq!(tr.reconcile_on_startup(&tz(), t(11, 1)).unwrap(), None);
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
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

    assert!(tr.undo(t(16, 0)).unwrap());
    let s = snap(&tr, t(10, 30));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_ms, 90 * MIN);
    assert!(!s.can_undo);
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    assert!(!tr.undo(t(16, 0)).unwrap());
}

#[test]
fn switch_is_undoable() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    let before = all_entries(&tr);
    tr.switch_to(b.id, t(10, 0)).unwrap();
    tr.undo(t(16, 0)).unwrap();
    assert_eq!(all_entries(&tr), before);
    let s = snap(&tr, t(10, 0));
    assert_eq!(s.status, ClockStatus::Paused);
    assert_eq!(s.session_ms, 30 * MIN);
}

/// Running A since 09:00, absence 12:05–13:10 noticed at 13:10.
fn with_absence() -> (Tracker, Project, Project) {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr
        .begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Idle)
        .unwrap());
    let s = snap(&tr, t(13, 10));
    let p = s.pending_absence.unwrap();
    assert_eq!((p.start, p.end, p.project_id), (t(12, 5), t(13, 10), a.id));
    (tr, a, b)
}

#[test]
fn absence_discount() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(13, 10))
        .unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![
            e(1, a.id, t(9, 0), Some(t(12, 5))),
            e(2, a.id, t(13, 10), None)
        ]
    );
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_project.map(|p| p.id), Some(a.id));
    assert_eq!(s.session_ms, (3 * 60 + 5 + 50) * MIN);
    assert_eq!(s.pending_absence, None);
    assert!(repo::lunches_between(&tr.db, day(), day())
        .unwrap()
        .is_empty());
}

#[test]
fn absence_discount_undo_restores_everything() {
    let (mut tr, _, _) = with_absence();
    let before = all_entries(&tr);
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(13, 10))
        .unwrap();
    assert!(tr.undo(t(16, 0)).unwrap());
    assert_eq!(all_entries(&tr), before);
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.session_ms, 5 * 60 * MIN);
    assert!(s.pending_absence.is_some(), "undo brings the question back");
}

#[test]
fn absence_lunch_marks_lunch() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10))
        .unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![
            e(1, a.id, t(9, 0), Some(t(12, 5))),
            e(2, a.id, t(13, 10), None)
        ]
    );
    let l = repo::lunches_between(&tr.db, day(), day()).unwrap();
    assert_eq!(
        l,
        vec![Lunch {
            day: day(),
            start: t(12, 5),
            end: t(13, 10)
        }]
    );
    tr.undo(t(16, 0)).unwrap();
    assert!(repo::lunches_between(&tr.db, day(), day())
        .unwrap()
        .is_empty());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn absence_lunch_replaces_existing_lunch_and_undo_restores_it() {
    let (mut tr, _, _) = with_absence();
    let old = Lunch {
        day: day(),
        start: t(11, 0),
        end: t(11, 30),
    };
    repo::upsert_lunch(&tr.db, &old).unwrap();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10))
        .unwrap();
    tr.undo(t(16, 0)).unwrap();
    assert_eq!(
        repo::lunches_between(&tr.db, day(), day()).unwrap(),
        vec![old]
    );
}

#[test]
fn absence_keep_changes_nothing() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Keep, t(13, 10))
        .unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.session_ms, 5 * 60 * MIN);
    assert_eq!(s.pending_absence, None);
    assert!(s.can_undo);
    tr.undo(t(16, 0)).unwrap();
    assert!(snap(&tr, t(14, 0)).pending_absence.is_some());
}

#[test]
fn absence_move_to_other_project() {
    let (mut tr, a, b) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::MoveTo(b.id), t(13, 10))
        .unwrap();
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
    tr.undo(t(16, 0)).unwrap();
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
    assert!(!tr
        .begin_absence(&tz(), t(9, 0), t(10, 0), AbsenceReason::Idle)
        .unwrap());
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(9, 30)).unwrap();
    assert!(!tr
        .begin_absence(&tz(), t(10, 0), t(11, 0), AbsenceReason::Sleep)
        .unwrap());
    assert_eq!(snap(&tr, t(11, 0)).pending_absence, None);
}

#[test]
fn sleep_with_stop_on_sleep_closes_at_sleep_start() {
    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(!tr
        .begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Sleep)
        .unwrap());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(12, 5)))]);
    let s = snap(&tr, t(13, 10));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.pending_absence, None);
    assert!(!s.can_undo);
    assert!(s.notice.unwrap().contains("12:05"));
}

#[test]
fn stop_on_sleep_closes_at_the_sleep_moment_not_last_activity() {
    // 40 min call without input (last activity 11:25), lid closed at 12:05: nothing is lost silently.
    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(!tr
        .begin_sleep_absence(&tz(), t(11, 25), t(12, 5), t(13, 10))
        .unwrap());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(12, 5)))]);
    assert!(snap(&tr, t(13, 10)).notice.unwrap().contains("12:05"));
}

#[test]
fn prompted_sleep_absence_starts_at_last_activity() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr
        .begin_sleep_absence(&tz(), t(11, 25), t(12, 5), t(13, 10))
        .unwrap());
    let p = snap(&tr, t(13, 10)).pending_absence.unwrap();
    assert_eq!(
        (p.start, p.end, p.reason),
        (t(11, 25), t(13, 10), AbsenceReason::Sleep)
    );
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn idle_absence_with_stop_on_sleep_still_asks() {
    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr
        .begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Idle)
        .unwrap());
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
}

#[test]
fn reconcile_closes_at_heartbeat_after_two_minutes() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.heartbeat(t(10, 0)).unwrap();
    // Simulate a restart.
    let mut tr = Tracker::new(tr.db);
    assert_eq!(
        tr.reconcile_on_startup(&tz(), t(10, 3)).unwrap(),
        Some(t(10, 0))
    );
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(10, 0)))]);
    let s = snap(&tr, t(10, 3));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(
        s.notice.as_deref(),
        Some("O relógio foi parado às 10:00, quando o app fechou")
    );
    assert!(s.can_undo);
    tr.undo(t(16, 0)).unwrap();
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
    assert_eq!(
        tr.reconcile_on_startup(&tz(), t(10, 0) + 2 * MIN).unwrap(),
        None
    );
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
    assert_eq!(
        tr.reconcile_on_startup(&tz(), t(12, 0)).unwrap(),
        Some(t(9, 0))
    );
    assert_eq!(all_entries(&tr)[1], e(2, b.id, t(9, 0), Some(t(9, 0))));
}

#[test]
fn quit_with_pending_absence_keeps_the_time_and_closes_at_now() {
    // An unanswered absence counts as Keep: quitting never discounts on its own.
    let (mut tr, a, _) = with_absence();
    tr.quit(t(13, 12)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(13, 12)))]);
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
    assert_eq!(
        r.unwrap_err().to_string(),
        "O início precisa ser antes do fim"
    );
    let r = tr.update_entry(en.id, None, Some(t(9, 0)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::InvalidRange)));
    assert!(matches!(
        tr.add_entry(a.id, t(10, 0), t(9, 0), t(12, 0)),
        Err(TrackerError::InvalidRange)
    ));
    assert_eq!(all_entries(&tr), vec![en]);
}

#[test]
fn add_entry_rejects_end_in_the_future() {
    let (mut tr, a, _) = setup();
    let r = tr.add_entry(a.id, t(11, 0), t(13, 0), t(12, 0));
    assert!(matches!(r, Err(TrackerError::FutureEnd)));
    assert_eq!(
        r.unwrap_err().to_string(),
        "O registro não pode terminar no futuro"
    );
    assert!(all_entries(&tr).is_empty());
    // Ending exactly now is fine.
    tr.add_entry(a.id, t(11, 0), t(12, 0), t(12, 0)).unwrap();
}

#[test]
fn update_entry_rejects_end_in_the_future() {
    let (mut tr, a, _) = setup();
    let en = tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    let r = tr.update_entry(en.id, None, Some(t(15, 0)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::FutureEnd)));
    // Moving a closed entry entirely into the future too.
    let r = tr.update_entry(en.id, Some(t(13, 0)), Some(t(14, 0)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::FutureEnd)));
    // Closing the running entry in the future would double count as well.
    tr.switch_to(a.id, t(11, 0)).unwrap();
    let open = repo::open_entry(&tr.db).unwrap().unwrap();
    let r = tr.update_entry(open.id, None, Some(t(13, 0)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::FutureEnd)));
    assert_eq!(all_entries(&tr), vec![en, open]);
}

#[test]
fn clock_refuses_to_start_before_a_future_entry() {
    // Legacy data (created before the future-end check) must not cause overlaps.
    let (mut tr, a, b) = setup();
    repo::insert_entry(&tr.db, a.id, t(11, 0), Some(t(13, 0))).unwrap();
    let before = all_entries(&tr);
    assert!(matches!(
        tr.switch_to(b.id, t(12, 0)),
        Err(TrackerError::FutureEnd)
    ));
    assert_eq!(all_entries(&tr), before);
    // After that entry ends, the clock starts normally.
    tr.switch_to(b.id, t(13, 0)).unwrap();
    tr.pause(t(13, 30)).unwrap();
    repo::insert_entry(&tr.db, a.id, t(13, 40), Some(t(14, 0))).unwrap();
    assert!(matches!(tr.resume(t(13, 45)), Err(TrackerError::FutureEnd)));
    tr.resume(t(14, 0)).unwrap();
}

#[test]
fn resolving_absence_refuses_with_a_future_entry() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(tr
        .begin_absence(&tz(), t(10, 0), t(10, 40), AbsenceReason::Idle)
        .unwrap());
    repo::insert_entry(&tr.db, b.id, t(11, 0), Some(t(12, 0))).unwrap();
    let before = all_entries(&tr);
    let r = tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(10, 45));
    assert!(matches!(r, Err(TrackerError::FutureEnd)));
    assert_eq!(all_entries(&tr), before);
    // The question stays so it can be answered later.
    assert!(snap(&tr, t(10, 45)).pending_absence.is_some());
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
    assert_eq!(
        r.unwrap_err().to_string(),
        "Esse horário sobrepõe outro registro"
    );
    // The open entry counts as ending at `now`.
    let r = tr.update_entry(y.id, None, Some(t(11, 30)), None, t(12, 0));
    assert!(matches!(r, Err(TrackerError::Overlap)));
    assert!(matches!(
        tr.add_entry(b.id, t(11, 50), t(11, 55), t(12, 0)),
        Err(TrackerError::Overlap)
    ));
    assert_eq!(all_entries(&tr), before);
    // A valid edit works and is undoable.
    tr.update_entry(x.id, Some(t(7, 30)), None, Some(b.id), t(12, 0))
        .unwrap();
    assert_eq!(
        repo::get_entry(&tr.db, x.id).unwrap(),
        Some(e(x.id, b.id, t(7, 30), Some(t(9, 0))))
    );
    tr.undo(t(16, 0)).unwrap();
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
    let ghost = Project {
        id: 42,
        name: "x".into(),
        client: "y".into(),
        color: "#fff".into(),
        archived: false,
    };
    assert!(matches!(
        tr.update_project(ghost),
        Err(TrackerError::NotFound)
    ));
}

#[test]
fn delete_running_entry_ends_session_and_undo_restores() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.delete_entry(1).unwrap();
    assert!(all_entries(&tr).is_empty());
    assert_eq!(snap(&tr, t(10, 0)).status, ClockStatus::Idle);
    tr.undo(t(16, 0)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    assert_eq!(snap(&tr, t(10, 0)).session_ms, 60 * MIN);
}

#[test]
fn unmark_lunch_is_undoable() {
    let (mut tr, _, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(13, 10))
        .unwrap();
    tr.unmark_lunch(day()).unwrap();
    assert!(repo::lunches_between(&tr.db, day(), day())
        .unwrap()
        .is_empty());
    tr.undo(t(16, 0)).unwrap();
    assert_eq!(
        repo::lunches_between(&tr.db, day(), day()).unwrap().len(),
        1
    );
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
    let r: Vec<i64> = snap(&tr, t(9, 0))
        .recents
        .iter()
        .map(|r| r.project.id)
        .collect();
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
        .week_report(
            &tz(),
            crate::domain::time::week_start(day()),
            t(20, 0),
            Grouping::Project,
        )
        .unwrap();
    assert_eq!(wr.total.total_ms, 10 * 60 * MIN);
}

#[test]
fn serde_shapes() {
    use serde_json::{from_str, json, to_value};
    assert_eq!(
        to_value(AbsenceResolution::Discount).unwrap(),
        json!({"kind": "discount"})
    );
    assert_eq!(
        to_value(AbsenceResolution::Lunch).unwrap(),
        json!({"kind": "lunch"})
    );
    assert_eq!(
        to_value(AbsenceResolution::Keep).unwrap(),
        json!({"kind": "keep"})
    );
    assert_eq!(
        to_value(AbsenceResolution::MoveTo(7)).unwrap(),
        json!({"kind": "moveTo", "projectId": 7})
    );
    assert_eq!(
        from_str::<AbsenceResolution>(r#"{"kind":"moveTo","projectId":7}"#).unwrap(),
        AbsenceResolution::MoveTo(7)
    );
    assert_eq!(
        from_str::<AbsenceResolution>(r#"{"kind":"keep"}"#).unwrap(),
        AbsenceResolution::Keep
    );
    assert_eq!(to_value(ClockStatus::Paused).unwrap(), json!("paused"));
    assert_eq!(to_value(AbsenceReason::Sleep).unwrap(), json!("sleep"));
    let a = Absence {
        start: 1,
        end: 2,
        reason: AbsenceReason::Idle,
        project_id: 3,
    };
    assert_eq!(
        to_value(&a).unwrap(),
        json!({"start": 1, "end": 2, "reason": "idle", "projectId": 3})
    );
    assert_eq!(
        to_value(TrackerError::Overlap).unwrap(),
        json!("Esse horário sobrepõe outro registro")
    );
    assert_eq!(
        to_value(TrackerError::FutureEnd).unwrap(),
        json!("O registro não pode terminar no futuro")
    );
}

#[test]
fn user_settings_never_change_onboarded() {
    let (mut tr, _, _) = setup();
    // A Settings window opened before onboarding finished holds `onboarded: false`.
    let stale = tr.settings().unwrap();
    assert!(!stale.onboarded);
    let mut st = tr.settings().unwrap();
    st.onboarded = true;
    tr.set_settings(st).unwrap();
    let mut edit = stale.clone();
    edit.idle_min = 30;
    tr.set_user_settings(edit).unwrap();
    let got = tr.settings().unwrap();
    assert!(got.onboarded);
    assert_eq!(got.idle_min, 30);
    // Nor can the client mark onboarding done.
    let (mut tr, _, _) = setup();
    let mut edit = tr.settings().unwrap();
    edit.onboarded = true;
    tr.set_user_settings(edit).unwrap();
    assert!(!tr.settings().unwrap().onboarded);
}

// ---- notes and the last closed block ----

#[test]
fn pause_and_stop_report_the_closed_block() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert_eq!(snap(&tr, t(9, 1)).last_closed_entry, None);
    tr.pause(t(10, 0)).unwrap();
    let first = all_entries(&tr)[0].id;
    let c = snap(&tr, t(10, 0)).last_closed_entry.unwrap();
    assert_eq!(tr.last_closed(), Some(c));
    assert_eq!(
        c,
        ClosedEntry {
            id: first,
            project_id: a.id,
            start: t(9, 0),
            end: t(10, 0)
        }
    );
    // pausing again (already paused) closes nothing
    tr.pause(t(10, 5)).unwrap();
    tr.resume(t(10, 10)).unwrap();
    assert_eq!(snap(&tr, t(10, 10)).last_closed_entry, None);
    tr.stop(t(11, 0)).unwrap();
    let c = snap(&tr, t(11, 0)).last_closed_entry.unwrap();
    assert_eq!((c.project_id, c.start, c.end), (a.id, t(10, 10), t(11, 0)));
    // switching projects does not offer a note
    tr.switch_to(a.id, t(12, 0)).unwrap();
    tr.switch_to(b.id, t(12, 30)).unwrap();
    assert_eq!(snap(&tr, t(12, 30)).last_closed_entry, None);
    // stop from paused closes nothing new
    tr.pause(t(13, 0)).unwrap();
    tr.stop(t(13, 5)).unwrap();
    assert_eq!(snap(&tr, t(13, 5)).last_closed_entry, None);
}

#[test]
fn undo_clears_the_last_closed_block() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.stop(t(10, 0)).unwrap();
    assert!(tr.undo(t(10, 1)).unwrap());
    assert_eq!(snap(&tr, t(10, 1)).last_closed_entry, None);
}

#[test]
fn set_entry_note_trims_clears_and_validates() {
    let (mut tr, a, _) = setup();
    let en = tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    let got = tr
        .set_entry_note(en.id, Some("  revisei o PR \n".into()))
        .unwrap();
    assert_eq!(got.note.as_deref(), Some("revisei o PR"));
    assert_eq!(all_entries(&tr)[0].note.as_deref(), Some("revisei o PR"));
    assert_eq!(
        tr.set_entry_note(en.id, Some("   ".into())).unwrap().note,
        None
    );
    tr.set_entry_note(en.id, Some("x".into())).unwrap();
    assert_eq!(tr.set_entry_note(en.id, None).unwrap().note, None);
    // 500 chars (not bytes) is the limit
    let ok = "é".repeat(500);
    assert_eq!(
        tr.set_entry_note(en.id, Some(ok.clone())).unwrap().note,
        Some(ok)
    );
    assert!(matches!(
        tr.set_entry_note(en.id, Some("a".repeat(501))),
        Err(TrackerError::NoteTooLong)
    ));
    assert!(matches!(
        tr.set_entry_note(999, Some("x".into())),
        Err(TrackerError::NotFound)
    ));
}

#[test]
fn saving_a_note_keeps_the_previous_undo() {
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.stop(t(10, 0)).unwrap();
    let id = snap(&tr, t(10, 0)).last_closed_entry.unwrap().id;
    tr.set_entry_note(id, Some("planejamento".into())).unwrap();
    assert!(snap(&tr, t(10, 0)).can_undo);
    // undo of the stop reopens the block and keeps its note
    assert!(tr.undo(t(10, 1)).unwrap());
    let es = all_entries(&tr);
    assert_eq!(
        (es[0].end, es[0].note.as_deref()),
        (None, Some("planejamento"))
    );
    assert_eq!(snap(&tr, t(10, 1)).status, ClockStatus::Running);
}

#[test]
fn notes_reach_day_segments() {
    let (mut tr, a, _) = setup();
    let en = tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    tr.set_entry_note(en.id, Some("daily".into())).unwrap();
    let d = tr.day_calc(&tz(), day(), t(12, 0)).unwrap();
    assert_eq!(d.segments[0].note.as_deref(), Some("daily"));
}

#[test]
fn closed_entry_serde_shape() {
    use serde_json::{json, to_value};
    let c = ClosedEntry {
        id: 1,
        project_id: 2,
        start: 3,
        end: 4,
    };
    assert_eq!(
        to_value(c).unwrap(),
        json!({"id": 1, "projectId": 2, "start": 3, "end": 4})
    );
    let (tr, _, _) = setup();
    let v = to_value(snap(&tr, t(9, 0))).unwrap();
    assert!(v.get("lastClosedEntry").is_some_and(|x| x.is_null()));
}

// ---- language ----

fn with_language(tr: &mut Tracker, l: crate::i18n::LanguagePref) {
    let mut st = tr.settings().unwrap();
    st.language = l;
    tr.set_settings(st).unwrap();
}

#[test]
fn lang_follows_settings_then_system() {
    use crate::i18n::{Lang, LanguagePref};
    let (mut tr, _, _) = setup();
    assert_eq!(
        tr.lang(),
        Lang::PtBr,
        "tests default to pt-BR as the system language"
    );
    tr.set_system_lang(Lang::Es);
    assert_eq!(tr.lang(), Lang::Es);
    with_language(&mut tr, LanguagePref::En);
    assert_eq!(tr.lang(), Lang::En);
    with_language(&mut tr, LanguagePref::System);
    assert_eq!(tr.lang(), Lang::Es);
}

#[test]
fn error_messages_per_language() {
    use crate::i18n::Lang;
    let cases = [
        (
            TrackerError::Overlap,
            [
                "Esse horário sobrepõe outro registro",
                "This time overlaps another record",
                "Este horario se superpone con otro registro",
            ],
        ),
        (
            TrackerError::NotFound,
            [
                "Registro não encontrado",
                "Record not found",
                "Registro no encontrado",
            ],
        ),
        (
            TrackerError::InvalidRange,
            [
                "O início precisa ser antes do fim",
                "Start has to be before end",
                "El inicio tiene que ser antes del fin",
            ],
        ),
        (
            TrackerError::FutureEnd,
            [
                "O registro não pode terminar no futuro",
                "A record can't end in the future",
                "El registro no puede terminar en el futuro",
            ],
        ),
        (
            TrackerError::NoSession,
            [
                "Nenhuma sessão ativa",
                "No active session",
                "No hay ninguna sesión activa",
            ],
        ),
        (
            TrackerError::NoteTooLong,
            [
                "A nota pode ter no máximo 500 caracteres",
                "Notes can have at most 500 characters",
                "La nota puede tener como máximo 500 caracteres",
            ],
        ),
    ];
    for (err, [pt, en, es]) in cases {
        assert_eq!(err.message(Lang::PtBr), pt);
        assert_eq!(err.message(Lang::En), en);
        assert_eq!(err.message(Lang::Es), es);
        assert_eq!(err.to_string(), pt, "Display stays pt-BR");
    }
    let store = TrackerError::from(rusqlite::Error::InvalidQuery);
    assert!(store
        .message(Lang::En)
        .starts_with("Couldn't access the data: "));
    assert!(store
        .message(Lang::PtBr)
        .starts_with("Erro ao acessar os dados: "));
}

#[test]
fn notices_render_in_the_current_language() {
    use crate::i18n::{Lang, LanguagePref};
    let (mut tr, a, _) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.heartbeat(t(10, 0)).unwrap();
    let mut tr = Tracker::new(tr.db);
    tr.set_system_lang(Lang::En);
    tr.reconcile_on_startup(&tz(), t(10, 3)).unwrap();
    assert_eq!(
        snap(&tr, t(10, 3)).notice.as_deref(),
        Some("The clock was stopped at 10:00, when the app closed")
    );
    // Switching language re-renders the pending notice (set_settings does not clear it).
    let key = snap(&tr, t(10, 3)).notice_key;
    assert_eq!(key, Some(format!("quit:{}", t(10, 0))));
    with_language(&mut tr, LanguagePref::Es);
    let s = snap(&tr, t(10, 3));
    assert_eq!(
        s.notice.as_deref(),
        Some("El reloj se detuvo a las 10:00, cuando la app se cerró")
    );
    assert_eq!(
        s.notice_key, key,
        "same notice, same identity in any language"
    );

    let (mut tr, a, _) = setup();
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    st.language = LanguagePref::En;
    tr.set_settings(st).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.begin_absence(&tz(), t(12, 5), t(13, 10), AbsenceReason::Sleep)
        .unwrap();
    assert_eq!(
        snap(&tr, t(13, 10)).notice.as_deref(),
        Some("The clock was stopped at 12:05, when the computer went to sleep")
    );
    assert_eq!(
        snap(&tr, t(13, 10)).notice_key,
        Some(format!("sleep:{}", t(12, 5)))
    );
}

// ---- delete project ----

#[test]
fn delete_project_without_entries() {
    let (mut tr, a, b) = setup();
    let d = tr.delete_project(a.id).unwrap();
    assert_eq!((d.project.id, d.entries, d.ms), (a.id, 0, 0));
    assert_eq!(
        tr.projects()
            .unwrap()
            .iter()
            .map(|p| p.id)
            .collect::<Vec<_>>(),
        vec![b.id]
    );
}

#[test]
fn delete_project_removes_its_entries_only() {
    let (mut tr, a, b) = setup();
    tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    tr.add_entry(a.id, t(10, 0), t(10, 30), t(12, 0)).unwrap();
    tr.add_entry(b.id, t(11, 0), t(11, 15), t(12, 0)).unwrap();
    assert_eq!(
        tr.project_usage(a.id).unwrap(),
        ProjectUsage {
            entries: 2,
            ms: 90 * MIN
        }
    );
    let d = tr.delete_project(a.id).unwrap();
    assert_eq!((d.entries, d.ms), (2, 90 * MIN));
    let es = all_entries(&tr);
    assert_eq!(es.len(), 1);
    assert_eq!(es[0].project_id, b.id);
}

#[test]
fn delete_project_refuses_session_project_running_or_paused() {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    assert!(matches!(
        tr.delete_project(a.id),
        Err(TrackerError::ProjectInSession)
    ));
    tr.pause(t(9, 10)).unwrap();
    assert!(matches!(
        tr.delete_project(a.id),
        Err(TrackerError::ProjectInSession)
    ));
    assert!(tr.delete_project(b.id).is_ok());
    assert_eq!(all_entries(&tr).len(), 1);
    tr.stop(t(9, 20)).unwrap();
    assert!(tr.delete_project(a.id).is_ok());
}

#[test]
fn delete_project_unknown_id_is_not_found() {
    let (mut tr, _, _) = setup();
    assert!(matches!(
        tr.delete_project(999),
        Err(TrackerError::NotFound)
    ));
    assert!(matches!(tr.project_usage(999), Err(TrackerError::NotFound)));
}

#[test]
fn undo_delete_project_restores_project_and_entries_with_same_ids() {
    let (mut tr, a, _b) = setup();
    let e1 = tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    let e2 = tr.add_entry(a.id, t(10, 0), t(10, 30), t(12, 0)).unwrap();
    let before_projects = tr.projects().unwrap();
    let before_entries = all_entries(&tr);
    tr.delete_project(a.id).unwrap();
    assert!(snap(&tr, t(12, 0)).can_undo);
    assert!(tr.undo(t(12, 1)).unwrap());
    assert_eq!(tr.projects().unwrap(), before_projects);
    assert_eq!(all_entries(&tr), before_entries);
    assert_eq!(
        all_entries(&tr).iter().map(|e| e.id).collect::<Vec<_>>(),
        vec![e1.id, e2.id]
    );
}

#[test]
fn failed_delete_project_rolls_back() {
    let (mut tr, a, _b) = setup();
    tr.add_entry(a.id, t(9, 0), t(10, 0), t(12, 0)).unwrap();
    let r: Result<()> = tr.run(true, |db, log| {
        delete_project_in(db, log, a.id)?;
        Err(TrackerError::NotFound)
    });
    assert!(r.is_err());
    assert_eq!(tr.projects().unwrap().len(), 2);
    assert_eq!(all_entries(&tr).len(), 1);
}

#[test]
fn undo_delete_project_keeps_its_created_at() {
    let (mut tr, a, _) = setup();
    tr.db
        .conn()
        .execute("UPDATE projects SET created_at = 42 WHERE id = ?1", [a.id])
        .unwrap();
    tr.delete_project(a.id).unwrap();
    tr.undo(t(12, 0)).unwrap();
    let created: i64 = tr
        .db
        .conn()
        .query_row(
            "SELECT created_at FROM projects WHERE id = ?1",
            [a.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(created, 42);
}

// ---- session time after editing closed blocks ----

/// A on 09:00–10:00 (paused), resumed 10:30: the session holds one closed block of 60 min.
fn paused_and_resumed() -> (Tracker, Project, Project) {
    let (mut tr, a, b) = setup();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.pause(t(10, 0)).unwrap();
    tr.resume(t(10, 30)).unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 90 * MIN);
    (tr, a, b)
}

#[test]
fn editing_a_closed_block_of_the_session_updates_session_time() {
    let (mut tr, _, _) = paused_and_resumed();
    tr.update_entry(1, None, Some(t(9, 30)), None, t(11, 0))
        .unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 60 * MIN);
    tr.update_entry(1, Some(t(9, 10)), Some(t(10, 10)), None, t(11, 0))
        .unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 90 * MIN);
    tr.undo(t(11, 0)).unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 60 * MIN);
}

#[test]
fn moving_a_closed_block_out_of_the_session_project_updates_session_time() {
    let (mut tr, _, b) = paused_and_resumed();
    tr.update_entry(1, None, None, Some(b.id), t(11, 0))
        .unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 30 * MIN);
}

#[test]
fn deleting_a_closed_block_of_the_session_updates_session_time() {
    let (mut tr, a, _) = paused_and_resumed();
    tr.delete_entry(1).unwrap();
    let s = snap(&tr, t(11, 0));
    assert_eq!(s.status, ClockStatus::Running);
    assert_eq!(s.session_project.map(|p| p.id), Some(a.id));
    assert_eq!(s.session_ms, 30 * MIN);
    tr.undo(t(11, 0)).unwrap();
    assert_eq!(snap(&tr, t(11, 0)).session_ms, 90 * MIN);
}

#[test]
fn editing_a_block_before_the_session_leaves_session_time() {
    let (mut tr, a, _) = setup();
    tr.add_entry(a.id, t(7, 0), t(8, 0), t(9, 0)).unwrap();
    tr.switch_to(a.id, t(9, 0)).unwrap();
    tr.update_entry(1, None, Some(t(7, 30)), None, t(9, 30))
        .unwrap();
    assert_eq!(snap(&tr, t(9, 30)).session_ms, 30 * MIN);
    tr.delete_entry(1).unwrap();
    assert_eq!(snap(&tr, t(9, 30)).session_ms, 30 * MIN);
}

// ---- absence questions are not lost ----

fn stop_on_sleep(tr: &mut Tracker) {
    let mut st = tr.settings().unwrap();
    st.stop_on_sleep = true;
    tr.set_settings(st).unwrap();
}

/// `with_absence` (idle 12:05–13:10 unanswered), then the lid closes at 13:20 with
/// stop-on-sleep and the machine wakes at 14:00.
fn absence_then_stop_on_sleep() -> (Tracker, Project, Project) {
    let (mut tr, a, b) = with_absence();
    stop_on_sleep(&mut tr);
    assert!(!tr
        .begin_sleep_absence(&tz(), t(13, 15), t(13, 20), t(14, 0))
        .unwrap());
    (tr, a, b)
}

#[test]
fn stop_on_sleep_keeps_a_pending_idle_question() {
    let (tr, a, _) = absence_then_stop_on_sleep();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(13, 20)))]);
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.status, ClockStatus::Idle);
    assert!(s.notice.is_some());
    let p = s
        .pending_absence
        .expect("the idle question survives the sleep");
    assert_eq!((p.start, p.end), (t(12, 5), t(13, 10)));
}

#[test]
fn discounting_a_question_on_a_closed_block_splits_it() {
    let (mut tr, a, _) = absence_then_stop_on_sleep();
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(14, 0))
        .unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![
            e(1, a.id, t(9, 0), Some(t(12, 5))),
            e(2, a.id, t(13, 10), Some(t(13, 20))),
        ]
    );
    let s = snap(&tr, t(14, 0));
    assert_eq!(s.status, ClockStatus::Idle);
    assert_eq!(s.pending_absence, None);
    tr.undo(t(14, 1)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), Some(t(13, 20)))]);
    assert_eq!(snap(&tr, t(14, 1)).status, ClockStatus::Idle);
    assert!(snap(&tr, t(14, 1)).pending_absence.is_some());
}

#[test]
fn lunch_and_move_on_a_closed_block() {
    let (mut tr, a, b) = absence_then_stop_on_sleep();
    tr.resolve_absence(&tz(), AbsenceResolution::MoveTo(b.id), t(14, 0))
        .unwrap();
    assert_eq!(
        all_entries(&tr),
        vec![
            e(1, a.id, t(9, 0), Some(t(12, 5))),
            e(2, b.id, t(12, 5), Some(t(13, 10))),
            e(3, a.id, t(13, 10), Some(t(13, 20))),
        ]
    );
    tr.undo(t(14, 1)).unwrap();
    tr.resolve_absence(&tz(), AbsenceResolution::Lunch, t(14, 1))
        .unwrap();
    assert_eq!(
        repo::lunches_between(&tr.db, day(), day()).unwrap(),
        vec![Lunch {
            day: day(),
            start: t(12, 5),
            end: t(13, 10)
        }]
    );
    assert_eq!(snap(&tr, t(14, 1)).status, ClockStatus::Idle);
}

#[test]
fn undoing_a_resolution_keeps_a_newer_question() {
    let (mut tr, a, _) = with_absence();
    tr.resolve_absence(&tz(), AbsenceResolution::Discount, t(13, 10))
        .unwrap();
    // A new idle period while the undo toast is still there.
    assert!(tr
        .begin_absence(&tz(), t(13, 30), t(14, 0), AbsenceReason::Idle)
        .unwrap());
    tr.undo(t(14, 0)).unwrap();
    assert_eq!(all_entries(&tr), vec![e(1, a.id, t(9, 0), None)]);
    let p = snap(&tr, t(14, 0)).pending_absence.unwrap();
    assert_eq!((p.start, p.end), (t(13, 30), t(14, 0)));
}

// ---- settings validation ----

#[test]
fn user_settings_are_clamped_to_valid_ranges() {
    let (mut tr, _, _) = setup();
    let mut st = tr.settings().unwrap();
    st.idle_min = 0;
    st.lunch_min = 10_000;
    st.rounding_min = 7;
    st.jornada_h = [f32::NAN, -3., 30., f32::INFINITY, 8.5, 0., 24.];
    tr.set_user_settings(st).unwrap();
    let got = tr.settings().unwrap();
    assert_eq!(got.idle_min, 1);
    assert_eq!(got.lunch_min, 240);
    assert_eq!(got.rounding_min, 0);
    assert_eq!(got.jornada_h, [0., 0., 24., 0., 8.5, 0., 24.]);

    let mut st = tr.settings().unwrap();
    st.idle_min = 999;
    st.rounding_min = 20;
    tr.set_user_settings(st).unwrap();
    let got = tr.settings().unwrap();
    assert_eq!((got.idle_min, got.rounding_min), (240, 15));
    let mut st = tr.settings().unwrap();
    st.rounding_min = 45;
    tr.set_user_settings(st).unwrap();
    assert_eq!(tr.settings().unwrap().rounding_min, 30);
}

#[test]
fn valid_user_settings_are_kept() {
    let (mut tr, _, _) = setup();
    let mut st = tr.settings().unwrap();
    st.idle_min = 20;
    st.lunch_min = 0;
    st.rounding_min = 30;
    st.jornada_h = [6., 6., 6., 6., 6., 0., 0.];
    tr.set_user_settings(st.clone()).unwrap();
    assert_eq!(tr.settings().unwrap(), st);
}
