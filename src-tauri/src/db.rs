//! SQLite-backed library: books, reading progress, and schema migrations.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Ordered list of migrations. Each entry runs once, tracked via `PRAGMA user_version`.
const MIGRATIONS: &[&str] = &[r#"
    CREATE TABLE books (
        id             INTEGER PRIMARY KEY,
        hash           TEXT NOT NULL UNIQUE,
        path           TEXT NOT NULL,
        format         TEXT NOT NULL,
        title          TEXT,
        authors        TEXT,
        added_at       INTEGER NOT NULL,
        last_opened_at INTEGER
    );
    CREATE TABLE progress (
        book_id    INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        cfi        TEXT NOT NULL,
        fraction   REAL NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX books_last_opened ON books(last_opened_at DESC);
"#];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub cfi: String,
    pub fraction: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i64,
    pub path: String,
    pub format: String,
    pub title: Option<String>,
    pub authors: Option<String>,
    pub last_opened_at: Option<i64>,
    pub progress: Option<Progress>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    Ok(conn)
}

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        conn.execute_batch(&format!(
            "BEGIN; {sql}; PRAGMA user_version = {}; COMMIT;",
            i + 1
        ))?;
    }
    Ok(())
}

const BOOK_COLUMNS: &str =
    "b.id, b.path, b.format, b.title, b.authors, b.last_opened_at, p.cfi, p.fraction";

fn row_to_book(r: &rusqlite::Row) -> rusqlite::Result<Book> {
    let cfi: Option<String> = r.get(6)?;
    let fraction: Option<f64> = r.get(7)?;
    Ok(Book {
        id: r.get(0)?,
        path: r.get(1)?,
        format: r.get(2)?,
        title: r.get(3)?,
        authors: r.get(4)?,
        last_opened_at: r.get(5)?,
        progress: cfi
            .zip(fraction)
            .map(|(cfi, fraction)| Progress { cfi, fraction }),
    })
}

pub fn get_book(conn: &Connection, id: i64) -> rusqlite::Result<Option<Book>> {
    conn.query_row(
        &format!("SELECT {BOOK_COLUMNS} FROM books b LEFT JOIN progress p ON p.book_id = b.id WHERE b.id = ?1"),
        [id],
        row_to_book,
    )
    .optional()
}

/// Registers a book by content hash (so a moved file keeps its progress) and marks it opened.
pub fn upsert_opened(
    conn: &Connection,
    hash: &str,
    path: &str,
    format: &str,
) -> rusqlite::Result<Book> {
    let ts = now();
    let id: i64 = conn.query_row(
        "INSERT INTO books (hash, path, format, added_at, last_opened_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(hash) DO UPDATE SET path = excluded.path, last_opened_at = excluded.last_opened_at
         RETURNING id",
        params![hash, path, format, ts],
        |r| r.get(0),
    )?;
    Ok(get_book(conn, id)?.expect("book just upserted"))
}

pub fn set_metadata(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    authors: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE books SET title = ?2, authors = ?3 WHERE id = ?1",
        params![id, title, authors],
    )?;
    Ok(())
}

pub fn save_progress(conn: &Connection, id: i64, cfi: &str, fraction: f64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO progress (book_id, cfi, fraction, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id) DO UPDATE SET cfi = excluded.cfi, fraction = excluded.fraction,
                                            updated_at = excluded.updated_at",
        params![id, cfi, fraction.clamp(0.0, 1.0), now()],
    )?;
    Ok(())
}

pub fn recent_books(conn: &Connection, limit: u32) -> rusqlite::Result<Vec<Book>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {BOOK_COLUMNS} FROM books b LEFT JOIN progress p ON p.book_id = b.id
         WHERE b.last_opened_at IS NOT NULL ORDER BY b.last_opened_at DESC LIMIT ?1"
    ))?;
    let rows = stmt.query_map([limit], row_to_book)?;
    rows.collect()
}

pub fn remove_book(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM books WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        conn
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = mem();
        init(&conn).unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v as usize, MIGRATIONS.len());
    }

    #[test]
    fn same_hash_reuses_book_and_updates_path() {
        let conn = mem();
        let a = upsert_opened(&conn, "abc", "/old/book.epub", "epub").unwrap();
        let b = upsert_opened(&conn, "abc", "/new/book.epub", "epub").unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(b.path, "/new/book.epub");
    }

    #[test]
    fn progress_round_trips_and_clamps() {
        let conn = mem();
        let book = upsert_opened(&conn, "h", "/b.epub", "epub").unwrap();
        assert!(book.progress.is_none());
        save_progress(&conn, book.id, "epubcfi(/6/4!/4/2)", 1.7).unwrap();
        let got = get_book(&conn, book.id).unwrap().unwrap();
        assert_eq!(
            got.progress,
            Some(Progress {
                cfi: "epubcfi(/6/4!/4/2)".into(),
                fraction: 1.0
            })
        );
    }

    #[test]
    fn recent_books_ordered_and_removal_cascades() {
        let conn = mem();
        let a = upsert_opened(&conn, "a", "/a.epub", "epub").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = upsert_opened(&conn, "b", "/b.epub", "epub").unwrap();
        set_metadata(&conn, b.id, Some("B"), Some("Author")).unwrap();
        save_progress(&conn, a.id, "x", 0.5).unwrap();
        let recent = recent_books(&conn, 10).unwrap();
        assert_eq!(
            recent.iter().map(|b| b.id).collect::<Vec<_>>(),
            vec![b.id, a.id]
        );
        assert_eq!(recent[0].title.as_deref(), Some("B"));
        remove_book(&conn, a.id).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM progress", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
