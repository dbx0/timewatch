//! One-level undo: a list of inverse operations recorded while an operation runs.
//! Applied in reverse order so rows are restored exactly (ids included).

use chrono::NaiveDate;

use super::{Absence, Session, META_PAUSED, META_SESSION};
use crate::domain::{Entry, Lunch};
use crate::store::{repo, Db, StoreError};

#[derive(Debug, Clone, PartialEq)]
pub enum UndoOp {
    /// Put the row back exactly as it was (re-inserting it with its id if deleted).
    RestoreEntry(Entry),
    /// Remove a row the operation inserted.
    DeleteEntry(i64),
    RestoreLunch(Lunch),
    DeleteLunch(NaiveDate),
    /// Session and paused flag as they were.
    RestoreSession(Option<Session>, bool),
    /// In-memory pending absence as it was (brings the question back).
    RestorePending(Option<Absence>),
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct UndoLog {
    ops: Vec<UndoOp>,
}

impl UndoLog {
    pub fn push(&mut self, op: UndoOp) {
        self.ops.push(op);
    }

    /// Applies the inverse ops in reverse order. `pending` receives a restored absence.
    pub fn apply(self, db: &Db, pending: &mut Option<Absence>) -> Result<(), StoreError> {
        for op in self.ops.into_iter().rev() {
            match op {
                UndoOp::RestoreEntry(e) => repo::put_entry(db, &e)?,
                UndoOp::DeleteEntry(id) => repo::delete_entry(db, id)?,
                UndoOp::RestoreLunch(l) => repo::upsert_lunch(db, &l)?,
                UndoOp::DeleteLunch(day) => repo::delete_lunch(db, day)?,
                UndoOp::RestoreSession(session, paused) => {
                    match session {
                        Some(s) => repo::set_meta(db, META_SESSION, &s)?,
                        None => repo::del_meta(db, META_SESSION)?,
                    }
                    if paused {
                        repo::set_meta(db, META_PAUSED, &true)?;
                    } else {
                        repo::del_meta(db, META_PAUSED)?;
                    }
                }
                UndoOp::RestorePending(p) => *pending = p,
            }
        }
        Ok(())
    }
}
