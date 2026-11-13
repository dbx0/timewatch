//! Data directory helpers: the bundle identifier moved from `dev.timewatch.app` to
//! `dev.timewatch.desktop` (a `.app` suffix confuses macOS), which moves `app_data_dir`.

use std::io;
use std::path::{Path, PathBuf};

pub const DB_FILE: &str = "timewatch.sqlite3";
/// Data directory name used by builds before the identifier change.
pub const LEGACY_IDENTIFIER: &str = "dev.timewatch.app";
/// The pre-rename data dir: a sibling of the current `app_data_dir`.
pub fn legacy_dir(new_dir: &Path) -> Option<PathBuf> {
    new_dir.parent().map(|p| p.join(LEGACY_IDENTIFIER))
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// Copies the legacy database into `new_dir` when `new_dir` has none yet. The copy is an SQLite
/// snapshot (`VACUUM INTO`), consistent even if an old build still has the database open, and
/// already includes whatever sat in its WAL. It is written under a temporary name and renamed
/// last, so an interrupted copy is retried on the next launch. The old files stay as a backup.
/// Returns whether a migration happened.
pub fn migrate_legacy_db(new_dir: &Path, old_dir: &Path) -> io::Result<bool> {
    let new_db = new_dir.join(DB_FILE);
    let old_db = old_dir.join(DB_FILE);
    if new_db.exists() || !old_db.is_file() || new_dir == old_dir {
        return Ok(false);
    }
    std::fs::create_dir_all(new_dir)?;
    let tmp = with_suffix(&new_db, ".migrating");
    if tmp.exists() {
        std::fs::remove_file(&tmp)?;
    }
    snapshot(&old_db, &tmp).map_err(io::Error::other)?;
    std::fs::rename(&tmp, &new_db)?;
    Ok(true)
}

fn snapshot(src: &Path, dst: &Path) -> rusqlite::Result<()> {
    let conn = rusqlite::Connection::open_with_flags(
        src,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute("VACUUM INTO ?1", [dst.to_string_lossy()])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "timewatch-migrate-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn legacy_dir_is_sibling() {
        let new = Path::new("/Users/x/Library/Application Support/dev.timewatch.desktop");
        assert_eq!(
            legacy_dir(new).unwrap(),
            Path::new("/Users/x/Library/Application Support/dev.timewatch.app")
        );
    }

    /// A real WAL-mode database with one committed row still in its WAL.
    fn make_db(path: &Path, value: &str) -> rusqlite::Connection {
        let c = rusqlite::Connection::open(path).unwrap();
        c.pragma_update(None, "journal_mode", "WAL").unwrap();
        c.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        c.execute_batch("CREATE TABLE t (v TEXT); PRAGMA user_version = 3;")
            .unwrap();
        c.execute("INSERT INTO t VALUES (?1)", [value]).unwrap();
        c
    }

    fn read(path: &Path) -> (String, i64) {
        let c = rusqlite::Connection::open(path).unwrap();
        let v = c.query_row("SELECT v FROM t", [], |r| r.get(0)).unwrap();
        let ver = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        (v, ver)
    }

    #[test]
    fn snapshots_db_including_wal_while_the_old_app_has_it_open() {
        let root = tempdir("copy");
        let (old, new) = (
            root.join("dev.timewatch.app"),
            root.join("dev.timewatch.desktop"),
        );
        std::fs::create_dir_all(&old).unwrap();
        let _held_open = make_db(&old.join(DB_FILE), "hours");
        assert!(old.join("timewatch.sqlite3-wal").exists());

        assert!(migrate_legacy_db(&new, &old).unwrap());
        assert_eq!(read(&new.join(DB_FILE)), ("hours".to_string(), 3));
        assert!(!new.join("timewatch.sqlite3.migrating").exists());
        // Old data kept as a backup.
        assert!(old.join(DB_FILE).exists());
        // Second run is a no-op.
        assert!(!migrate_legacy_db(&new, &old).unwrap());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn leftover_temp_file_is_replaced() {
        let root = tempdir("retry");
        let (old, new) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        drop(make_db(&old.join(DB_FILE), "x"));
        std::fs::write(new.join("timewatch.sqlite3.migrating"), b"torn").unwrap();

        assert!(migrate_legacy_db(&new, &old).unwrap());
        assert_eq!(read(&new.join(DB_FILE)).0, "x");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn never_overwrites_existing_new_db() {
        let root = tempdir("keep");
        let (old, new) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join(DB_FILE), b"old").unwrap();
        std::fs::write(new.join(DB_FILE), b"new").unwrap();

        assert!(!migrate_legacy_db(&new, &old).unwrap());
        assert_eq!(std::fs::read(new.join(DB_FILE)).unwrap(), b"new");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn nothing_to_migrate_without_legacy_db() {
        let root = tempdir("none");
        let (old, new) = (root.join("old"), root.join("new"));
        assert!(!migrate_legacy_db(&new, &old).unwrap());
        assert!(!new.exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
