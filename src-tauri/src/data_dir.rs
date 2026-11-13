//! Data directory helpers: the bundle identifier moved from `dev.timewatch.app` to
//! `dev.timewatch.desktop` (a `.app` suffix confuses macOS), which moves `app_data_dir`.

use std::io;
use std::path::{Path, PathBuf};

pub const DB_FILE: &str = "timewatch.sqlite3";
/// Data directory name used by builds before the identifier change.
pub const LEGACY_IDENTIFIER: &str = "dev.timewatch.app";
/// SQLite side files that must travel with the database (WAL mode).
const SIDE_SUFFIXES: [&str; 2] = ["-wal", "-shm"];

/// The pre-rename data dir: a sibling of the current `app_data_dir`.
pub fn legacy_dir(new_dir: &Path) -> Option<PathBuf> {
    new_dir.parent().map(|p| p.join(LEGACY_IDENTIFIER))
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// Copies the legacy database (plus `-wal`/`-shm`) into `new_dir` when `new_dir` has none yet.
/// The old files are left in place as a backup. The main file is written under a temporary name
/// and renamed last, so an interrupted copy is retried on the next launch instead of leaving a
/// database without its WAL. Returns whether a migration happened.
pub fn migrate_legacy_db(new_dir: &Path, old_dir: &Path) -> io::Result<bool> {
    let new_db = new_dir.join(DB_FILE);
    let old_db = old_dir.join(DB_FILE);
    if new_db.exists() || !old_db.is_file() || new_dir == old_dir {
        return Ok(false);
    }
    std::fs::create_dir_all(new_dir)?;
    for suffix in SIDE_SUFFIXES {
        let src = with_suffix(&old_db, suffix);
        let dst = with_suffix(&new_db, suffix);
        if src.is_file() {
            std::fs::copy(&src, &dst)?;
        } else if dst.exists() {
            // A stale side file from a failed earlier attempt must not pair with the copied db.
            std::fs::remove_file(&dst)?;
        }
    }
    let tmp = with_suffix(&new_db, ".migrating");
    std::fs::copy(&old_db, &tmp)?;
    std::fs::rename(&tmp, &new_db)?;
    Ok(true)
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

    #[test]
    fn copies_db_and_side_files_when_new_dir_is_empty() {
        let root = tempdir("copy");
        let (old, new) = (
            root.join("dev.timewatch.app"),
            root.join("dev.timewatch.desktop"),
        );
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join(DB_FILE), b"db").unwrap();
        std::fs::write(old.join("timewatch.sqlite3-wal"), b"wal").unwrap();
        std::fs::write(old.join("timewatch.sqlite3-shm"), b"shm").unwrap();

        assert!(migrate_legacy_db(&new, &old).unwrap());
        assert_eq!(std::fs::read(new.join(DB_FILE)).unwrap(), b"db");
        assert_eq!(
            std::fs::read(new.join("timewatch.sqlite3-wal")).unwrap(),
            b"wal"
        );
        assert_eq!(
            std::fs::read(new.join("timewatch.sqlite3-shm")).unwrap(),
            b"shm"
        );
        assert!(!new.join("timewatch.sqlite3.migrating").exists());
        // Old data kept as a backup.
        assert!(old.join(DB_FILE).exists());
        // Second run is a no-op.
        assert!(!migrate_legacy_db(&new, &old).unwrap());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn copies_db_without_side_files() {
        let root = tempdir("nowal");
        let (old, new) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join(DB_FILE), b"db").unwrap();
        // Leftover from an interrupted attempt.
        std::fs::write(new.join("timewatch.sqlite3-wal"), b"stale").unwrap();

        assert!(migrate_legacy_db(&new, &old).unwrap());
        assert_eq!(std::fs::read(new.join(DB_FILE)).unwrap(), b"db");
        assert!(!new.join("timewatch.sqlite3-wal").exists());
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
