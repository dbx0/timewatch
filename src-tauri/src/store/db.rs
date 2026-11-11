use std::path::Path;

use rusqlite::Connection;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

const SCHEMA_V1: &str = "
CREATE TABLE projects(
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    client TEXT NOT NULL,
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE TABLE entries(
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    start INTEGER NOT NULL,
    \"end\" INTEGER NULL
);
CREATE INDEX idx_entries_start ON entries(start);
CREATE UNIQUE INDEX idx_entries_one_open ON entries((1)) WHERE \"end\" IS NULL;
CREATE TABLE lunches(
    day TEXT PRIMARY KEY,
    start INTEGER NOT NULL,
    \"end\" INTEGER NOT NULL
);
CREATE TABLE meta(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

/// v2: free-text note per entry.
const SCHEMA_V2: &str = "ALTER TABLE entries ADD COLUMN note TEXT NULL;";

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> Result<Db, StoreError> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Db, StoreError> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Db, StoreError> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Db { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), StoreError> {
        let v: i64 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if v < 1 {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(SCHEMA_V1)?;
            tx.pragma_update(None, "user_version", 1)?;
            tx.commit()?;
        }
        if v < 2 {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(SCHEMA_V2)?;
            tx.pragma_update(None, "user_version", 2)?;
            tx.commit()?;
        }
        Ok(())
    }

    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_fresh_db() {
        let db = Db::open_in_memory().unwrap();
        let v: i64 = db.conn().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 2);
    }

    #[test]
    fn migrates_v1_db_to_v2_keeping_entries() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.execute(
            "INSERT INTO projects(id, name, client, color, archived, created_at) VALUES (1, 'A', 'C', '#fff', 0, 0)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO entries(id, project_id, start, \"end\") VALUES (7, 1, 10, 20)", []).unwrap();
        let db = Db::init(conn).unwrap();
        let v: i64 = db.conn().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 2);
        let (start, note): (i64, Option<String>) = db
            .conn()
            .query_row("SELECT start, note FROM entries WHERE id = 7", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((start, note), (10, None));
    }

    #[test]
    fn open_file_db_is_idempotent() {
        let dir = std::env::temp_dir().join(format!("tw-store-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        drop(Db::open(&path).unwrap());
        let db = Db::open(&path).unwrap();
        let v: i64 = db.conn().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 2);
        std::fs::remove_dir_all(&dir).ok();
    }
}
