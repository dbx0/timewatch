//! Tracker: the clock state machine (spec 6.2), absence handling (6.3), one-level undo
//! and the heartbeat. Every mutation runs inside one SQLite transaction, so a failed
//! operation leaves data unchanged.
//!
//! State model: the open entry (if any) means Running; otherwise `meta.session` plus
//! `meta.paused == true` means Paused; anything else is Idle. `Session.accum_ms` holds the
//! time of the session's already-closed blocks.

#[cfg(test)]
mod tests;
mod undo;

use chrono::{Duration, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use crate::domain::calc::{self, DayCalc, Grouping, WeekReport};
use crate::domain::time::{day_bounds, local_day};
use crate::domain::{Entry, Lunch, Ms, Project, Settings, MAX_NOTE_CHARS};
use crate::i18n::{fill, Lang};
use crate::store::{repo, Db, StoreError};
pub use undo::{UndoLog, UndoOp};

pub(crate) const META_SETTINGS: &str = "settings";
pub(crate) const META_SESSION: &str = "session";
pub(crate) const META_PAUSED: &str = "paused";
pub(crate) const META_HEARTBEAT: &str = "heartbeat";

/// Gap after which an open entry found at startup is considered abandoned.
const HEARTBEAT_STALE_MS: i64 = 120_000;
const MAX_RECENTS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClockStatus {
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub project_id: i64,
    pub accum_ms: i64,
}

/// What a project holds: its entry count and total closed time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsage {
    pub entries: u32,
    pub ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedProject {
    pub project: Project,
    pub entries: u32,
    pub ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AbsenceReason {
    Idle,
    Sleep,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Absence {
    pub start: Ms,
    pub end: Ms,
    pub reason: AbsenceReason,
    pub project_id: i64,
}

/// Serialized as `{"kind": "discount"|"lunch"|"keep"|"moveTo", "projectId"?: n}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "ResolutionRepr", into = "ResolutionRepr")]
pub enum AbsenceResolution {
    Discount,
    Lunch,
    Keep,
    MoveTo(i64),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ResolutionRepr {
    Discount,
    Lunch,
    Keep,
    #[serde(rename_all = "camelCase")]
    MoveTo {
        project_id: i64,
    },
}

impl From<ResolutionRepr> for AbsenceResolution {
    fn from(r: ResolutionRepr) -> Self {
        match r {
            ResolutionRepr::Discount => Self::Discount,
            ResolutionRepr::Lunch => Self::Lunch,
            ResolutionRepr::Keep => Self::Keep,
            ResolutionRepr::MoveTo { project_id } => Self::MoveTo(project_id),
        }
    }
}

impl From<AbsenceResolution> for ResolutionRepr {
    fn from(r: AbsenceResolution) -> Self {
        match r {
            AbsenceResolution::Discount => Self::Discount,
            AbsenceResolution::Lunch => Self::Lunch,
            AbsenceResolution::Keep => Self::Keep,
            AbsenceResolution::MoveTo(project_id) => Self::MoveTo { project_id },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub project: Project,
    pub today_ms: i64,
    pub shortcut: Option<u8>,
}

/// The block a pause/stop just closed, so the notch can offer a note for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClosedEntry {
    pub id: i64,
    pub project_id: i64,
    pub start: Ms,
    pub end: Ms,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerSnapshot {
    pub status: ClockStatus,
    pub session_project: Option<Project>,
    pub session_ms: i64,
    pub running_since: Option<Ms>,
    pub today_ms: i64,
    pub today_jornada_ms: i64,
    pub recents: Vec<RecentProject>,
    pub projects: Vec<Project>,
    pub pending_absence: Option<Absence>,
    pub can_undo: bool,
    pub notice: Option<String>,
    /// Identity of `notice` (kind and time), stable across languages, so the UI shows it once.
    pub notice_key: Option<String>,
    /// Set by the last operation when it was a pause/stop that closed a block; any other
    /// mutation (or undo) clears it.
    pub last_closed_entry: Option<ClosedEntry>,
}

#[derive(Debug)]
pub enum TrackerError {
    Store(StoreError),
    NotFound,
    InvalidRange,
    Overlap,
    FutureEnd,
    NoSession,
    NoteTooLong,
    ProjectInSession,
}

impl TrackerError {
    /// The user-facing message in `lang` (commands send this to the frontend).
    pub fn message(&self, lang: Lang) -> String {
        let t = lang.strings();
        match self {
            Self::Store(e) => fill(t.err_store, &[&e.to_string()]),
            Self::NotFound => t.err_not_found.into(),
            Self::InvalidRange => t.err_invalid_range.into(),
            Self::Overlap => t.err_overlap.into(),
            Self::FutureEnd => t.err_future_end.into(),
            Self::NoSession => t.err_no_session.into(),
            Self::NoteTooLong => t.err_note_too_long.into(),
            Self::ProjectInSession => t.err_project_in_session.into(),
        }
    }
}

/// Defaults to pt-BR; user-facing paths use `message(lang)`.
impl std::fmt::Display for TrackerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message(Lang::PtBr))
    }
}

impl std::error::Error for TrackerError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Store(e) => Some(e),
            _ => None,
        }
    }
}

impl From<StoreError> for TrackerError {
    fn from(e: StoreError) -> Self {
        Self::Store(e)
    }
}

impl From<rusqlite::Error> for TrackerError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Store(e.into())
    }
}

/// Serialized as the pt-BR message (commands map errors with `message(lang)` instead).
impl Serialize for TrackerError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, TrackerError>;

/// A one-shot message for the notch, rendered in the language current at snapshot time.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Notice {
    /// Clock stopped on sleep at `at` (`hhmm` is its local `HH:MM`).
    Sleep { at: Ms, hhmm: String },
    /// Clock stopped at `at` because the app closed.
    Quit { at: Ms, hhmm: String },
}

impl Notice {
    fn render(&self, lang: Lang) -> String {
        let t = lang.strings();
        match self {
            Notice::Sleep { hhmm, .. } => fill(t.notice_sleep, &[hhmm]),
            Notice::Quit { hhmm, .. } => fill(t.notice_quit, &[hhmm]),
        }
    }

    fn key(&self) -> String {
        match self {
            Notice::Sleep { at, .. } => format!("sleep:{at}"),
            Notice::Quit { at, .. } => format!("quit:{at}"),
        }
    }
}

pub struct Tracker {
    db: Db,
    pending: Option<Absence>,
    undo: Option<UndoLog>,
    notice: Option<Notice>,
    last_closed: Option<ClosedEntry>,
    /// The OS language, injected by the app (pt-BR until then, so tests are deterministic).
    system_lang: Lang,
}

/// What `Tracker::run` does with the undo slot after a successful operation.
#[derive(Clone, Copy, PartialEq, Eq)]
enum UndoMode {
    /// The recorded log becomes the undo.
    Record,
    /// The undo is cleared.
    Clear,
    /// The previous undo stays (operations that are not undoable and touch nothing it restores).
    Keep,
}

impl From<bool> for UndoMode {
    fn from(undoable: bool) -> Self {
        if undoable {
            UndoMode::Record
        } else {
            UndoMode::Clear
        }
    }
}

// ---- free helpers over the db (used inside transactions) ----

fn hhmm<Tz: TimeZone>(tz: &Tz, ms: Ms) -> String {
    tz.timestamp_millis_opt(ms)
        .single()
        .map(|d| d.naive_local().format("%H:%M").to_string())
        .unwrap_or_default()
}

fn load_session(db: &Db) -> Result<(Option<Session>, bool)> {
    let s = repo::get_meta::<Session>(db, META_SESSION)?;
    let paused = repo::get_meta::<bool>(db, META_PAUSED)?.unwrap_or(false);
    Ok((s, paused))
}

fn save_session(db: &Db, s: Option<&Session>, paused: bool) -> Result<()> {
    match s {
        Some(s) => repo::set_meta(db, META_SESSION, s)?,
        None => repo::del_meta(db, META_SESSION)?,
    }
    if paused {
        repo::set_meta(db, META_PAUSED, &true)?;
    } else {
        repo::del_meta(db, META_PAUSED)?;
    }
    Ok(())
}

/// Records the current session for undo and returns it.
fn record_session(db: &Db, log: &mut UndoLog) -> Result<(Option<Session>, bool)> {
    let (s, paused) = load_session(db)?;
    log.push(UndoOp::RestoreSession(s.clone(), paused));
    Ok((s, paused))
}

/// The running session, tolerating a missing/mismatched `meta.session`.
fn running_session(s: Option<Session>, open: &Entry) -> Session {
    match s {
        Some(s) if s.project_id == open.project_id => s,
        _ => Session {
            project_id: open.project_id,
            accum_ms: 0,
        },
    }
}

fn delete_project_in(db: &Db, log: &mut UndoLog, id: i64) -> Result<DeletedProject> {
    let p = project(db, id)?;
    let in_session = load_session(db)?.0.is_some_and(|s| s.project_id == id)
        || repo::open_entry(db)?.is_some_and(|o| o.project_id == id);
    if in_session {
        return Err(TrackerError::ProjectInSession);
    }
    let es = repo::entries_of_project(db, id)?;
    for e in &es {
        log.push(UndoOp::RestoreEntry(e.clone()));
    }
    log.push(UndoOp::RestoreProject(p.clone()));
    repo::delete_entries_of_project(db, id)?;
    repo::delete_project(db, id)?;
    Ok(DeletedProject {
        project: p,
        entries: es.len() as u32,
        ms: es
            .iter()
            .filter_map(|e| e.end.map(|end| (end - e.start).max(0)))
            .sum(),
    })
}

fn project(db: &Db, id: i64) -> Result<Project> {
    repo::list_projects(db)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or(TrackerError::NotFound)
}

/// Closes `e` at `at` (never before its start). Returns the closed block.
fn close_entry(db: &Db, log: &mut UndoLog, e: &Entry, at: Ms) -> Result<ClosedEntry> {
    log.push(UndoOp::RestoreEntry(e.clone()));
    let end = at.max(e.start);
    repo::update_entry(
        db,
        &Entry {
            end: Some(end),
            ..e.clone()
        },
    )?;
    Ok(ClosedEntry {
        id: e.id,
        project_id: e.project_id,
        start: e.start,
        end,
    })
}

fn insert_entry(db: &Db, log: &mut UndoLog, pid: i64, start: Ms, end: Option<Ms>) -> Result<Entry> {
    let e = repo::insert_entry(db, pid, start, end)?;
    log.push(UndoOp::DeleteEntry(e.id));
    if end.is_none() {
        // A fresh heartbeat so a crash before the first tick closes near the clock in.
        bump_heartbeat(db, start)?;
    }
    Ok(e)
}

/// Moves the heartbeat forward to `at`; never moves it backwards.
fn bump_heartbeat(db: &Db, at: Ms) -> Result<()> {
    let hb = repo::get_meta::<Ms>(db, META_HEARTBEAT)?;
    if hb.is_none_or(|hb| hb < at) {
        repo::set_meta(db, META_HEARTBEAT, &at)?;
    }
    Ok(())
}

/// Rejects inverted ranges, ends in the future (the clock would count that time again) and
/// overlaps (open entries end at `now`; touching is fine).
fn validate_range(db: &Db, exclude: Option<i64>, start: Ms, end: Ms, now: Ms) -> Result<()> {
    if start >= end {
        return Err(TrackerError::InvalidRange);
    }
    if end > now {
        return Err(TrackerError::FutureEnd);
    }
    let clash = repo::entries_between(db, start, end)?
        .into_iter()
        .any(|o| Some(o.id) != exclude && start < o.end.unwrap_or(now) && o.start < end);
    if clash {
        return Err(TrackerError::Overlap);
    }
    Ok(())
}

/// Refuses to open an entry at `now` while a closed entry ends after it (legacy data from before
/// `validate_range` rejected future ends): the open entry would overlap it.
fn ensure_no_future_entry(db: &Db, now: Ms) -> Result<()> {
    let future = repo::entries_between(db, now, Ms::MAX)?
        .into_iter()
        .any(|o| o.end.is_some_and(|e| e > now));
    if future {
        return Err(TrackerError::FutureEnd);
    }
    Ok(())
}

impl Tracker {
    pub fn new(db: Db) -> Tracker {
        Tracker {
            db,
            pending: None,
            undo: None,
            notice: None,
            last_closed: None,
            system_lang: Lang::PtBr,
        }
    }

    pub fn set_system_lang(&mut self, lang: Lang) {
        self.system_lang = lang;
    }

    /// The resolved UI language: the stored preference, `system` meaning the OS language.
    pub fn lang(&self) -> Lang {
        self.settings()
            .map_or(self.system_lang, |s| s.language.resolve(self.system_lang))
    }

    /// Runs `f` in one transaction. On success the undo slot is updated per `mode` (a bool
    /// means record/clear), and the notice and last closed block are reset.
    /// On error the transaction rolls back and in-memory state is untouched.
    fn run<T>(
        &mut self,
        mode: impl Into<UndoMode>,
        f: impl FnOnce(&Db, &mut UndoLog) -> Result<T>,
    ) -> Result<T> {
        let mut log = UndoLog::default();
        let tx = self.db.conn().unchecked_transaction()?;
        let out = f(&self.db, &mut log)?;
        tx.commit()?;
        match mode.into() {
            UndoMode::Record => self.undo = Some(log),
            UndoMode::Clear => self.undo = None,
            UndoMode::Keep => {}
        }
        self.notice = None;
        self.last_closed = None;
        Ok(out)
    }

    pub fn settings(&self) -> Result<Settings> {
        Ok(repo::get_meta(&self.db, META_SETTINGS)?.unwrap_or_default())
    }

    pub fn set_settings(&mut self, s: Settings) -> Result<()> {
        Ok(repo::set_meta(&self.db, META_SETTINGS, &s)?)
    }

    /// Settings saved from the UI. `onboarded` is server-owned (only `finish_onboarding` /
    /// skip change it): a Settings window opened before onboarding finished must not reset it.
    pub fn set_user_settings(&mut self, mut s: Settings) -> Result<()> {
        s.onboarded = self.settings()?.onboarded;
        self.set_settings(s)
    }

    /// The block the last pause/stop closed (cleared by any later mutation).
    pub fn last_closed(&self) -> Option<ClosedEntry> {
        self.last_closed
    }

    pub fn clear_notice(&mut self) {
        self.notice = None;
    }

    // ---- clock ----

    /// Closes the open entry (if any) and starts a new session on `pid`.
    /// Switching to the project that is already running is a no-op.
    pub fn switch_to(&mut self, pid: i64, now: Ms) -> Result<()> {
        let open = repo::open_entry(&self.db)?;
        if open.as_ref().is_some_and(|o| o.project_id == pid) {
            return Ok(());
        }
        let pending = self.pending.clone();
        self.run(true, |db, log| {
            project(db, pid)?;
            ensure_no_future_entry(db, now)?;
            log.push(UndoOp::RestorePending(pending));
            record_session(db, log)?;
            if let Some(o) = &open {
                close_entry(db, log, o, now)?;
            }
            insert_entry(db, log, pid, now, None)?;
            save_session(
                db,
                Some(&Session {
                    project_id: pid,
                    accum_ms: 0,
                }),
                false,
            )
        })?;
        self.pending = None;
        Ok(())
    }

    /// Onboarding in ONE transaction: creates the projects (`(name, client, color)`), marks the
    /// settings onboarded (other fields kept) and optionally starts `start_index`.
    /// Any failure rolls everything back, so a retry cannot duplicate projects.
    pub fn finish_onboarding(
        &mut self,
        projects: &[(String, String, String)],
        start_index: Option<usize>,
        now: Ms,
    ) -> Result<()> {
        let open = repo::open_entry(&self.db)?;
        let pending = self.pending.clone();
        self.run(false, |db, log| {
            if start_index.is_some_and(|i| i >= projects.len()) {
                return Err(TrackerError::NotFound);
            }
            let mut ids = Vec::with_capacity(projects.len());
            for (name, client, color) in projects {
                ids.push(repo::insert_project(db, name, client, color)?.id);
            }
            let mut st: Settings = repo::get_meta(db, META_SETTINGS)?.unwrap_or_default();
            st.onboarded = true;
            repo::set_meta(db, META_SETTINGS, &st)?;
            if let Some(i) = start_index {
                log.push(UndoOp::RestorePending(pending));
                record_session(db, log)?;
                if let Some(o) = &open {
                    close_entry(db, log, o, now)?;
                }
                insert_entry(db, log, ids[i], now, None)?;
                save_session(
                    db,
                    Some(&Session {
                        project_id: ids[i],
                        accum_ms: 0,
                    }),
                    false,
                )?;
            }
            Ok(())
        })?;
        if start_index.is_some() {
            self.pending = None;
        }
        Ok(())
    }

    pub fn pause(&mut self, now: Ms) -> Result<()> {
        let Some(open) = repo::open_entry(&self.db)? else {
            return match load_session(&self.db)? {
                (Some(_), true) => Ok(()),
                _ => Err(TrackerError::NoSession),
            };
        };
        let pending = self.pending.clone();
        let closed = self.run(true, |db, log| {
            log.push(UndoOp::RestorePending(pending));
            let (s, _) = record_session(db, log)?;
            let mut s = running_session(s, &open);
            let closed = close_entry(db, log, &open, now)?;
            s.accum_ms += closed.end - closed.start;
            save_session(db, Some(&s), true)?;
            Ok(closed)
        })?;
        self.pending = None;
        self.last_closed = Some(closed);
        Ok(())
    }

    pub fn resume(&mut self, now: Ms) -> Result<()> {
        if repo::open_entry(&self.db)?.is_some() {
            return Ok(());
        }
        let (Some(s), true) = load_session(&self.db)? else {
            return Err(TrackerError::NoSession);
        };
        let pending = self.pending.clone();
        self.run(true, |db, log| {
            ensure_no_future_entry(db, now)?;
            log.push(UndoOp::RestorePending(pending));
            record_session(db, log)?;
            insert_entry(db, log, s.project_id, now, None)?;
            save_session(db, Some(&s), false)
        })
    }

    pub fn stop(&mut self, now: Ms) -> Result<()> {
        let open = repo::open_entry(&self.db)?;
        if open.is_none() && load_session(&self.db)?.0.is_none() {
            return Ok(());
        }
        let pending = self.pending.clone();
        let closed = self.run(true, |db, log| {
            log.push(UndoOp::RestorePending(pending));
            record_session(db, log)?;
            let closed = match &open {
                Some(o) => Some(close_entry(db, log, o, now)?),
                None => None,
            };
            save_session(db, None, false)?;
            Ok(closed)
        })?;
        self.pending = None;
        self.last_closed = closed;
        Ok(())
    }

    // ---- absence ----

    /// Records an absence of the running entry. Returns whether the user must be asked.
    /// Sleep with `stop_on_sleep` closes the entry at `start` instead (not undoable).
    pub fn begin_absence<Tz: TimeZone>(
        &mut self,
        tz: &Tz,
        start: Ms,
        end: Ms,
        reason: AbsenceReason,
    ) -> Result<bool> {
        self.begin(tz, start, start, end, reason)
    }

    /// A sleep detected on wake. `last_activity` starts the absence the user is asked about;
    /// with `stop_on_sleep` the entry closes at `sleep_at` (spec 6.3: "no momento do repouso"),
    /// never at the earlier last activity: that would discount time without asking (anti-goal 1).
    pub fn begin_sleep_absence<Tz: TimeZone>(
        &mut self,
        tz: &Tz,
        last_activity: Ms,
        sleep_at: Ms,
        end: Ms,
    ) -> Result<bool> {
        self.begin(
            tz,
            last_activity.min(sleep_at),
            sleep_at,
            end,
            AbsenceReason::Sleep,
        )
    }

    fn begin<Tz: TimeZone>(
        &mut self,
        tz: &Tz,
        start: Ms,
        stop_at: Ms,
        end: Ms,
        reason: AbsenceReason,
    ) -> Result<bool> {
        let Some(open) = repo::open_entry(&self.db)? else {
            return Ok(false);
        };
        let start = start.max(open.start);
        if end <= start {
            return Ok(false);
        }
        if reason == AbsenceReason::Sleep && self.settings()?.stop_on_sleep {
            let stop_at = stop_at.clamp(open.start, end);
            self.run(false, |db, log| {
                close_entry(db, log, &open, stop_at)?;
                save_session(db, None, false)
            })?;
            self.pending = None;
            self.notice = Some(Notice::Sleep {
                at: stop_at,
                hhmm: hhmm(tz, stop_at),
            });
            return Ok(false);
        }
        // A newer absence replaces an unanswered one; the older interval stays counted.
        self.pending = Some(Absence {
            start,
            end,
            reason,
            project_id: open.project_id,
        });
        Ok(true)
    }

    /// Applies the user's answer to the pending absence (spec 6.3). Undoable; undo also
    /// brings the question back.
    pub fn resolve_absence<Tz: TimeZone>(
        &mut self,
        tz: &Tz,
        res: AbsenceResolution,
        now: Ms,
    ) -> Result<()> {
        let a = self.pending.clone().ok_or(TrackerError::NotFound)?;
        let open = match repo::open_entry(&self.db)? {
            Some(o) if o.project_id == a.project_id => o,
            _ => {
                self.pending = None;
                return Err(TrackerError::NoSession);
            }
        };
        let res = match res {
            AbsenceResolution::MoveTo(pid) if pid == a.project_id => AbsenceResolution::Keep,
            r => r,
        };
        self.run(true, |db, log| {
            log.push(UndoOp::RestorePending(Some(a.clone())));
            if res == AbsenceResolution::Keep {
                return Ok(());
            }
            if let AbsenceResolution::MoveTo(pid) = res {
                project(db, pid)?;
            }
            ensure_no_future_entry(db, now)?;
            let back = a.end.min(now).max(a.start);
            let (s, _) = record_session(db, log)?;
            let mut s = running_session(s, &open);
            let closed = close_entry(db, log, &open, a.start)?;
            s.accum_ms += closed.end - closed.start;
            if let AbsenceResolution::MoveTo(pid) = res {
                if back > a.start {
                    insert_entry(db, log, pid, a.start, Some(back))?;
                }
            }
            insert_entry(db, log, a.project_id, back, None)?;
            // The app is alive at answer time, which may be long after `back`.
            bump_heartbeat(db, now)?;
            save_session(db, Some(&s), false)?;
            if res == AbsenceResolution::Lunch {
                let day = local_day(tz, a.start);
                match repo::lunches_between(db, day, day)?.into_iter().next() {
                    Some(old) => log.push(UndoOp::RestoreLunch(old)),
                    None => log.push(UndoOp::DeleteLunch(day)),
                }
                repo::upsert_lunch(
                    db,
                    &Lunch {
                        day,
                        start: a.start,
                        end: back,
                    },
                )?;
            }
            Ok(())
        })?;
        self.pending = None;
        Ok(())
    }

    // ---- undo, heartbeat, startup, quit ----

    /// Reverts the last undoable operation. Returns false when there is nothing to undo.
    /// If an entry is running afterwards, the heartbeat is refreshed to `now`.
    pub fn undo(&mut self, now: Ms) -> Result<bool> {
        let Some(log) = self.undo.clone() else {
            return Ok(false);
        };
        let mut pending = self.pending.clone();
        let tx = self.db.conn().unchecked_transaction()?;
        log.apply(&self.db, &mut pending)?;
        if repo::open_entry(&self.db)?.is_some() {
            repo::set_meta(&self.db, META_HEARTBEAT, &now)?;
        }
        tx.commit()?;
        self.pending = pending;
        self.undo = None;
        self.notice = None;
        self.last_closed = None;
        Ok(true)
    }

    /// Proof of life while running (spec 6.2); call every minute and before sleep.
    pub fn heartbeat(&self, now: Ms) -> Result<()> {
        if repo::open_entry(&self.db)?.is_some() {
            repo::set_meta(&self.db, META_HEARTBEAT, &now)?;
        }
        Ok(())
    }

    /// If an entry was left open and the last heartbeat is older than 2 min, closes it at
    /// the heartbeat (never before its start), ends the session and sets an undoable notice.
    /// Returns the close time.
    pub fn reconcile_on_startup<Tz: TimeZone>(&mut self, tz: &Tz, now: Ms) -> Result<Option<Ms>> {
        let Some(open) = repo::open_entry(&self.db)? else {
            // A "running" session without an open entry is stale: drop it.
            if let (Some(_), false) = load_session(&self.db)? {
                save_session(&self.db, None, false)?;
            }
            return Ok(None);
        };
        let hb = repo::get_meta::<Ms>(&self.db, META_HEARTBEAT)?;
        let last = hb.unwrap_or(open.start).max(open.start);
        if now - last <= HEARTBEAT_STALE_MS {
            repo::set_meta(&self.db, META_HEARTBEAT, &now)?;
            return Ok(None);
        }
        self.run(true, |db, log| {
            record_session(db, log)?;
            close_entry(db, log, &open, last)?;
            save_session(db, None, false)
        })?;
        self.pending = None;
        self.notice = Some(Notice::Quit {
            at: last,
            hhmm: hhmm(tz, last),
        });
        Ok(Some(last))
    }

    /// Stops the clock on app exit: at the pending absence start if there is one, else at
    /// `now`. Ends the session. Not undoable.
    pub fn quit(&mut self, now: Ms) -> Result<()> {
        let open = repo::open_entry(&self.db)?;
        let at = self.pending.as_ref().map_or(now, |a| a.start.min(now));
        self.run(false, |db, log| {
            if let Some(o) = &open {
                close_entry(db, log, o, at)?;
            }
            save_session(db, None, false)
        })?;
        self.pending = None;
        Ok(())
    }

    // ---- projects, entries, lunches ----

    pub fn create_project(&mut self, name: &str, client: &str, color: &str) -> Result<Project> {
        self.run(false, |db, _| {
            Ok(repo::insert_project(db, name, client, color)?)
        })
    }

    pub fn update_project(&mut self, p: Project) -> Result<()> {
        self.run(false, |db, _| {
            project(db, p.id)?;
            Ok(repo::update_project(db, &p)?)
        })
    }

    /// Entry count and total time of a project's entries (closed blocks).
    pub fn project_usage(&self, id: i64) -> Result<ProjectUsage> {
        project(&self.db, id)?;
        let es = repo::entries_of_project(&self.db, id)?;
        Ok(ProjectUsage {
            entries: es.len() as u32,
            ms: es
                .iter()
                .filter_map(|e| e.end.map(|end| (end - e.start).max(0)))
                .sum(),
        })
    }

    /// Deletes a project and all its entries in one transaction. Refused for the project
    /// in the session (running or paused). Undoable.
    pub fn delete_project(&mut self, id: i64, _now: Ms) -> Result<DeletedProject> {
        self.run(true, |db, log| delete_project_in(db, log, id))
    }

    pub fn add_entry(&mut self, pid: i64, start: Ms, end: Ms, now: Ms) -> Result<Entry> {
        self.run(true, |db, log| {
            project(db, pid)?;
            validate_range(db, None, start, end, now)?;
            insert_entry(db, log, pid, start, Some(end))
        })
    }

    /// Edits an entry. Setting `end` on the running entry stops the clock; changing its
    /// project moves the session to that project.
    pub fn update_entry(
        &mut self,
        id: i64,
        start: Option<Ms>,
        end: Option<Ms>,
        project_id: Option<i64>,
        now: Ms,
    ) -> Result<Entry> {
        let pending = self.pending.clone();
        let (entry, was_open) = self.run(true, |db, log| {
            let old = repo::get_entry(db, id)?.ok_or(TrackerError::NotFound)?;
            let new = Entry {
                id,
                project_id: project_id.unwrap_or(old.project_id),
                start: start.unwrap_or(old.start),
                end: end.or(old.end),
                note: old.note.clone(),
            };
            if project_id.is_some() {
                project(db, new.project_id)?;
            }
            validate_range(db, Some(id), new.start, new.end.unwrap_or(now), now)?;
            log.push(UndoOp::RestoreEntry(old.clone()));
            repo::update_entry(db, &new)?;
            let was_open = old.end.is_none();
            if was_open {
                log.push(UndoOp::RestorePending(pending));
                let (s, _) = record_session(db, log)?;
                if new.end.is_some() {
                    save_session(db, None, false)?;
                } else if new.project_id != old.project_id {
                    let s = Session {
                        project_id: new.project_id,
                        ..running_session(s, &old)
                    };
                    save_session(db, Some(&s), false)?;
                }
            }
            Ok((new, was_open))
        })?;
        if was_open {
            self.pending = None;
        }
        Ok(entry)
    }

    /// Deletes an entry; deleting the running one stops the clock.
    pub fn delete_entry(&mut self, id: i64) -> Result<()> {
        let pending = self.pending.clone();
        let was_open = self.run(true, |db, log| {
            let old = repo::get_entry(db, id)?.ok_or(TrackerError::NotFound)?;
            log.push(UndoOp::RestoreEntry(old.clone()));
            repo::delete_entry(db, id)?;
            let was_open = old.end.is_none();
            if was_open {
                log.push(UndoOp::RestorePending(pending));
                record_session(db, log)?;
                save_session(db, None, false)?;
            }
            Ok(was_open)
        })?;
        if was_open {
            self.pending = None;
        }
        Ok(())
    }

    /// Sets the note of an entry: trimmed, blank means none, at most `MAX_NOTE_CHARS`.
    /// Not undoable, and keeps the previous undo (e.g. the stop that prompted the note).
    pub fn set_entry_note(&mut self, id: i64, note: Option<String>) -> Result<Entry> {
        let note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        if note
            .as_ref()
            .is_some_and(|n| n.chars().count() > MAX_NOTE_CHARS)
        {
            return Err(TrackerError::NoteTooLong);
        }
        self.run(UndoMode::Keep, |db, _| {
            if !repo::set_entry_note(db, id, note.as_deref())? {
                return Err(TrackerError::NotFound);
            }
            repo::get_entry(db, id)?.ok_or(TrackerError::NotFound)
        })
    }

    pub fn unmark_lunch(&mut self, day: NaiveDate) -> Result<()> {
        self.run(true, |db, log| {
            let old = repo::lunches_between(db, day, day)?
                .into_iter()
                .next()
                .ok_or(TrackerError::NotFound)?;
            log.push(UndoOp::RestoreLunch(old));
            Ok(repo::delete_lunch(db, day)?)
        })
    }

    // ---- reads ----

    pub fn snapshot<Tz: TimeZone>(&self, tz: &Tz, now: Ms) -> Result<TrackerSnapshot> {
        let db = &self.db;
        let open = repo::open_entry(db)?;
        let (session, paused) = load_session(db)?;
        let projects = repo::list_projects(db)?;
        let find = |id: i64| projects.iter().find(|p| p.id == id).cloned();

        let (status, session) = match (&open, session) {
            (Some(o), s) => (ClockStatus::Running, Some(running_session(s, o))),
            (None, Some(s)) if paused => (ClockStatus::Paused, Some(s)),
            _ => (ClockStatus::Idle, None),
        };
        let settings = self.settings()?;
        let lang = settings.language.resolve(self.system_lang);
        let session_ms = session.as_ref().map_or(0, |s| {
            s.accum_ms + open.as_ref().map_or(0, |o| (now - o.start).max(0))
        });

        let today = local_day(tz, now);
        let bounds = day_bounds(tz, today);
        let segs = calc::day_segments(&repo::entries_between(db, bounds.0, bounds.1)?, bounds, now);
        let project_today = |pid: i64| {
            segs.iter()
                .filter(|g| g.project_id == pid)
                .map(|g| g.end - g.start)
                .sum()
        };

        let mut picked: Vec<Project> = Vec::new();
        for pid in repo::recent_project_ids(db, now)? {
            if picked.len() == MAX_RECENTS {
                break;
            }
            if let Some(p) = find(pid).filter(|p| !p.archived) {
                picked.push(p);
            }
        }
        let mut rest: Vec<&Project> = projects
            .iter()
            .filter(|p| !p.archived && !picked.iter().any(|q| q.id == p.id))
            .collect();
        rest.sort_by_key(|p| (p.name.to_lowercase(), p.id));
        let room = MAX_RECENTS.saturating_sub(picked.len());
        picked.extend(rest.into_iter().take(room).cloned());
        let recents = picked
            .into_iter()
            .enumerate()
            .map(|(i, p)| RecentProject {
                today_ms: project_today(p.id),
                project: p,
                shortcut: Some(i as u8 + 1),
            })
            .collect();

        Ok(TrackerSnapshot {
            status,
            session_project: session.as_ref().and_then(|s| find(s.project_id)),
            session_ms,
            running_since: open.as_ref().map(|o| o.start),
            today_ms: segs.iter().map(|g| g.end - g.start).sum(),
            today_jornada_ms: settings.jornada_ms(today),
            recents,
            projects,
            pending_absence: self.pending.clone(),
            can_undo: self.undo.is_some(),
            notice: self.notice.as_ref().map(|n| n.render(lang)),
            notice_key: self.notice.as_ref().map(Notice::key),
            last_closed_entry: self.last_closed,
        })
    }

    pub fn projects(&self) -> Result<Vec<Project>> {
        Ok(repo::list_projects(&self.db)?)
    }

    pub fn week_report<Tz: TimeZone>(
        &self,
        tz: &Tz,
        week_start: NaiveDate,
        now: Ms,
        grouping: Grouping,
    ) -> Result<WeekReport> {
        let last = week_start + Duration::days(6);
        let (from, _) = day_bounds(tz, week_start);
        let (_, to) = day_bounds(tz, last);
        let entries = repo::entries_between(&self.db, from, to)?;
        let lunches = repo::lunches_between(&self.db, week_start, last)?;
        let projects = repo::list_projects(&self.db)?;
        Ok(calc::week_report(
            tz,
            week_start,
            local_day(tz, now),
            &projects,
            &entries,
            &lunches,
            &self.settings()?,
            now,
            grouping,
        ))
    }

    pub fn day_calc<Tz: TimeZone>(&self, tz: &Tz, day: NaiveDate, now: Ms) -> Result<DayCalc> {
        let (from, to) = day_bounds(tz, day);
        let entries = repo::entries_between(&self.db, from, to)?;
        let lunches = repo::lunches_between(&self.db, day, day)?;
        Ok(calc::day_calc(
            tz,
            day,
            local_day(tz, now),
            &entries,
            &lunches,
            &self.settings()?,
            now,
        ))
    }
}
