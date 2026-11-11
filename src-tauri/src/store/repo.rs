use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension, Row};
use serde::{de::DeserializeOwned, Serialize};

use super::{Db, StoreError};
use crate::domain::{Entry, Lunch, Ms, Project};

type Result<T> = std::result::Result<T, StoreError>;

const DAY_FMT: &str = "%Y-%m-%d";

fn now_ms() -> Ms {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as Ms)
        .unwrap_or(0)
}

fn project_from(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        client: r.get(2)?,
        color: r.get(3)?,
        archived: r.get::<_, i64>(4)? != 0,
    })
}

fn entry_from(r: &Row) -> rusqlite::Result<Entry> {
    Ok(Entry { id: r.get(0)?, project_id: r.get(1)?, start: r.get(2)?, end: r.get(3)? })
}

pub fn insert_project(db: &Db, name: &str, client: &str, color: &str) -> Result<Project> {
    db.conn().execute(
        "INSERT INTO projects(name, client, color, archived, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        params![name, client, color, now_ms()],
    )?;
    Ok(Project {
        id: db.conn().last_insert_rowid(),
        name: name.to_string(),
        client: client.to_string(),
        color: color.to_string(),
        archived: false,
    })
}

pub fn update_project(db: &Db, p: &Project) -> Result<()> {
    db.conn().execute(
        "UPDATE projects SET name = ?2, client = ?3, color = ?4, archived = ?5 WHERE id = ?1",
        params![p.id, p.name, p.client, p.color, p.archived as i64],
    )?;
    Ok(())
}

pub fn list_projects(db: &Db) -> Result<Vec<Project>> {
    let mut st =
        db.conn().prepare("SELECT id, name, client, color, archived FROM projects ORDER BY id")?;
    let rows = st.query_map([], project_from)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn insert_entry(db: &Db, project_id: i64, start: Ms, end: Option<Ms>) -> Result<Entry> {
    db.conn().execute(
        "INSERT INTO entries(project_id, start, \"end\") VALUES (?1, ?2, ?3)",
        params![project_id, start, end],
    )?;
    Ok(Entry { id: db.conn().last_insert_rowid(), project_id, start, end })
}

pub fn update_entry(db: &Db, e: &Entry) -> Result<()> {
    db.conn().execute(
        "UPDATE entries SET project_id = ?2, start = ?3, \"end\" = ?4 WHERE id = ?1",
        params![e.id, e.project_id, e.start, e.end],
    )?;
    Ok(())
}

pub fn delete_entry(db: &Db, id: i64) -> Result<()> {
    db.conn().execute("DELETE FROM entries WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_entry(db: &Db, id: i64) -> Result<Option<Entry>> {
    Ok(db
        .conn()
        .query_row(
            "SELECT id, project_id, start, \"end\" FROM entries WHERE id = ?1",
            params![id],
            entry_from,
        )
        .optional()?)
}

pub fn open_entry(db: &Db) -> Result<Option<Entry>> {
    Ok(db
        .conn()
        .query_row(
            "SELECT id, project_id, start, \"end\" FROM entries WHERE \"end\" IS NULL",
            [],
            entry_from,
        )
        .optional()?)
}

/// Entries overlapping `[from, to)`, including the open one.
pub fn entries_between(db: &Db, from: Ms, to: Ms) -> Result<Vec<Entry>> {
    let mut st = db.conn().prepare(
        "SELECT id, project_id, start, \"end\" FROM entries
         WHERE start < ?2 AND (\"end\" IS NULL OR \"end\" > ?1)
         ORDER BY start, id",
    )?;
    let rows = st.query_map(params![from, to], entry_from)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn last_entries(db: &Db, limit: usize) -> Result<Vec<Entry>> {
    let mut st = db.conn().prepare(
        "SELECT id, project_id, start, \"end\" FROM entries
         ORDER BY COALESCE(\"end\", start) DESC, id DESC LIMIT ?1",
    )?;
    let rows = st.query_map(params![limit as i64], entry_from)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn upsert_lunch(db: &Db, l: &Lunch) -> Result<()> {
    db.conn().execute(
        "INSERT INTO lunches(day, start, \"end\") VALUES (?1, ?2, ?3)
         ON CONFLICT(day) DO UPDATE SET start = excluded.start, \"end\" = excluded.\"end\"",
        params![l.day.format(DAY_FMT).to_string(), l.start, l.end],
    )?;
    Ok(())
}

pub fn delete_lunch(db: &Db, day: NaiveDate) -> Result<()> {
    db.conn().execute("DELETE FROM lunches WHERE day = ?1", params![day.format(DAY_FMT).to_string()])?;
    Ok(())
}

/// Lunches with `from <= day <= to`.
pub fn lunches_between(db: &Db, from: NaiveDate, to: NaiveDate) -> Result<Vec<Lunch>> {
    let mut st = db.conn().prepare(
        "SELECT day, start, \"end\" FROM lunches WHERE day >= ?1 AND day <= ?2 ORDER BY day",
    )?;
    let rows = st
        .query_map(
            params![from.format(DAY_FMT).to_string(), to.format(DAY_FMT).to_string()],
            |r| {
                let day: String = r.get(0)?;
                let day = NaiveDate::parse_from_str(&day, DAY_FMT).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
                })?;
                Ok(Lunch { day, start: r.get(1)?, end: r.get(2)? })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn get_meta<T: DeserializeOwned>(db: &Db, key: &str) -> Result<Option<T>> {
    let raw: Option<String> = db
        .conn()
        .query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| r.get(0))
        .optional()?;
    match raw {
        Some(s) => Ok(Some(serde_json::from_str(&s)?)),
        None => Ok(None),
    }
}

pub fn set_meta<T: Serialize>(db: &Db, key: &str, value: &T) -> Result<()> {
    let json = serde_json::to_string(value)?;
    db.conn().execute(
        "INSERT INTO meta(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, json],
    )?;
    Ok(())
}

pub fn del_meta(db: &Db, key: &str) -> Result<()> {
    db.conn().execute("DELETE FROM meta WHERE key = ?1", params![key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Settings;

    #[test]
    fn project_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let mut p = insert_project(&db, "Alpha", "Acme", "#4f86ff").unwrap();
        assert!(!p.archived);
        p.archived = true;
        p.name = "Beta".into();
        update_project(&db, &p).unwrap();
        assert_eq!(list_projects(&db).unwrap(), vec![p]);
    }

    #[test]
    fn entries_between_includes_overlapping_and_open() {
        let db = Db::open_in_memory().unwrap();
        let p = insert_project(&db, "A", "C", "#fff").unwrap();
        let before = insert_entry(&db, p.id, 0, Some(100)).unwrap();
        let overlap = insert_entry(&db, p.id, 150, Some(250)).unwrap();
        let inside = insert_entry(&db, p.id, 300, Some(400)).unwrap();
        let open = insert_entry(&db, p.id, 450, None).unwrap();
        let got = entries_between(&db, 200, 500).unwrap();
        assert_eq!(got, vec![overlap, inside, open.clone()]);
        assert!(!got.contains(&before));
        assert_eq!(open_entry(&db).unwrap(), Some(open));
    }

    #[test]
    fn only_one_open_entry() {
        let db = Db::open_in_memory().unwrap();
        let p = insert_project(&db, "A", "C", "#fff").unwrap();
        insert_entry(&db, p.id, 10, None).unwrap();
        assert!(insert_entry(&db, p.id, 20, None).is_err());
    }

    #[test]
    fn entry_requires_existing_project() {
        let db = Db::open_in_memory().unwrap();
        assert!(insert_entry(&db, 999, 10, Some(20)).is_err());
    }

    #[test]
    fn entry_crud_and_last_entries() {
        let db = Db::open_in_memory().unwrap();
        let p = insert_project(&db, "A", "C", "#fff").unwrap();
        let mut a = insert_entry(&db, p.id, 10, Some(20)).unwrap();
        let b = insert_entry(&db, p.id, 30, Some(40)).unwrap();
        a.end = Some(25);
        update_entry(&db, &a).unwrap();
        assert_eq!(get_entry(&db, a.id).unwrap(), Some(a.clone()));
        assert_eq!(last_entries(&db, 1).unwrap(), vec![b.clone()]);
        delete_entry(&db, b.id).unwrap();
        assert_eq!(get_entry(&db, b.id).unwrap(), None);
    }

    #[test]
    fn lunch_upsert_range_delete() {
        let db = Db::open_in_memory().unwrap();
        let d = |n| NaiveDate::from_ymd_opt(2026, 11, n).unwrap();
        let mut l = Lunch { day: d(10), start: 1, end: 2 };
        upsert_lunch(&db, &l).unwrap();
        l.end = 3;
        upsert_lunch(&db, &l).unwrap();
        upsert_lunch(&db, &Lunch { day: d(12), start: 5, end: 6 }).unwrap();
        assert_eq!(lunches_between(&db, d(10), d(11)).unwrap(), vec![l.clone()]);
        assert_eq!(lunches_between(&db, d(10), d(12)).unwrap().len(), 2);
        delete_lunch(&db, d(10)).unwrap();
        assert_eq!(lunches_between(&db, d(10), d(12)).unwrap().len(), 1);
    }

    #[test]
    fn meta_roundtrip_settings() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(get_meta::<Settings>(&db, "settings").unwrap(), None);
        let s = Settings::default();
        set_meta(&db, "settings", &s).unwrap();
        assert_eq!(get_meta::<Settings>(&db, "settings").unwrap(), Some(s));
        set_meta(&db, "paused", &true).unwrap();
        assert_eq!(get_meta::<bool>(&db, "paused").unwrap(), Some(true));
        del_meta(&db, "paused").unwrap();
        assert_eq!(get_meta::<bool>(&db, "paused").unwrap(), None);
    }
}
