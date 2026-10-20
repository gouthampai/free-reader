//! SQLite-backed library: books, reading progress, collections, and schema migrations.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Ordered list of migrations. Each entry runs once, tracked via `PRAGMA user_version`.
/// Never edit a migration that has shipped; append a new one instead.
const MIGRATIONS: &[&str] = &[
    r#"
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
    "#,
    r#"
    ALTER TABLE books ADD COLUMN series       TEXT;
    ALTER TABLE books ADD COLUMN series_index REAL;
    ALTER TABLE books ADD COLUMN language     TEXT;
    ALTER TABLE books ADD COLUMN publisher    TEXT;
    ALTER TABLE books ADD COLUMN description  TEXT;
    ALTER TABLE books ADD COLUMN cover_path   TEXT;
    ALTER TABLE books ADD COLUMN managed      INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE books ADD COLUMN file_size    INTEGER;
    CREATE TABLE collections (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE collection_books (
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        added_at      INTEGER NOT NULL,
        PRIMARY KEY (collection_id, book_id)
    );
    CREATE INDEX collection_books_book ON collection_books(book_id);
    "#,
    r#"
    CREATE TABLE annotations (
        id         INTEGER PRIMARY KEY,
        book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('highlight', 'bookmark')),
        cfi        TEXT NOT NULL,
        text       TEXT,
        note       TEXT,
        color      TEXT,
        chapter    TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX annotations_book ON annotations(book_id);

    -- Full-text index. Section text lives in book_sections; book_text is an external-content
    -- FTS5 index over it, kept in sync by triggers (so cascading book deletes clean it up).
    ALTER TABLE books ADD COLUMN indexed_at INTEGER;
    CREATE TABLE book_sections (
        id      INTEGER PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        section INTEGER NOT NULL,
        text    TEXT NOT NULL
    );
    CREATE INDEX book_sections_book ON book_sections(book_id);
    CREATE VIRTUAL TABLE book_text USING fts5(
        text, content='book_sections', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER book_sections_ai AFTER INSERT ON book_sections BEGIN
        INSERT INTO book_text(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER book_sections_ad AFTER DELETE ON book_sections BEGIN
        INSERT INTO book_text(book_text, rowid, text) VALUES ('delete', old.id, old.text);
    END;
    "#,
];

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
    /// Multiple authors are joined with " & ".
    pub authors: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub cover_path: Option<String>,
    /// True when the file lives in the app's managed library folder (and is deleted with the book).
    pub managed: bool,
    pub file_size: Option<i64>,
    pub added_at: i64,
    pub last_opened_at: Option<i64>,
    pub progress: Option<Progress>,
    pub collection_ids: Vec<i64>,
    /// The file is no longer at `path` (a linked book that was moved or deleted).
    pub missing: bool,
}

/// Fields known when a book is first added to the library.
#[derive(Debug, Clone, Default)]
pub struct NewBook {
    pub hash: String,
    pub path: String,
    pub format: String,
    pub managed: bool,
    pub file_size: Option<i64>,
    pub meta: Metadata,
}

/// User-editable descriptive metadata.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Metadata {
    pub title: Option<String>,
    pub authors: Option<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
}

impl Metadata {
    /// Trims strings and turns blanks into `None`.
    pub fn normalized(self) -> Self {
        let clean = |s: Option<String>| s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        Metadata {
            title: clean(self.title),
            authors: clean(self.authors),
            series: clean(self.series),
            series_index: self.series_index.filter(|n| n.is_finite()),
            language: clean(self.language),
            publisher: clean(self.publisher),
            description: clean(self.description),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub book_count: i64,
}

pub fn now() -> i64 {
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
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        conn.execute_batch(&format!(
            "BEGIN; {sql}; PRAGMA user_version = {}; COMMIT;",
            i + 1
        ))?;
    }
    Ok(())
}

const BOOK_SELECT: &str = "
    SELECT b.id, b.path, b.format, b.title, b.authors, b.series, b.series_index, b.language,
           b.publisher, b.description, b.cover_path, b.managed, b.file_size, b.added_at,
           b.last_opened_at, p.cfi, p.fraction,
           (SELECT group_concat(collection_id) FROM collection_books WHERE book_id = b.id)
    FROM books b LEFT JOIN progress p ON p.book_id = b.id";

fn row_to_book(r: &rusqlite::Row) -> rusqlite::Result<Book> {
    let cfi: Option<String> = r.get(15)?;
    let fraction: Option<f64> = r.get(16)?;
    let collections: Option<String> = r.get(17)?;
    let path: String = r.get(1)?;
    Ok(Book {
        id: r.get(0)?,
        format: r.get(2)?,
        title: r.get(3)?,
        authors: r.get(4)?,
        series: r.get(5)?,
        series_index: r.get(6)?,
        language: r.get(7)?,
        publisher: r.get(8)?,
        description: r.get(9)?,
        cover_path: r.get(10)?,
        managed: r.get(11)?,
        file_size: r.get(12)?,
        added_at: r.get(13)?,
        last_opened_at: r.get(14)?,
        progress: cfi
            .zip(fraction)
            .map(|(cfi, fraction)| Progress { cfi, fraction }),
        collection_ids: collections
            .map(|s| s.split(',').filter_map(|x| x.parse().ok()).collect())
            .unwrap_or_default(),
        missing: !Path::new(&path).exists(),
        path,
    })
}

pub fn get_book(conn: &Connection, id: i64) -> rusqlite::Result<Option<Book>> {
    conn.query_row(&format!("{BOOK_SELECT} WHERE b.id = ?1"), [id], row_to_book)
        .optional()
}

pub fn find_by_hash(conn: &Connection, hash: &str) -> rusqlite::Result<Option<Book>> {
    conn.query_row(
        &format!("{BOOK_SELECT} WHERE b.hash = ?1"),
        [hash],
        row_to_book,
    )
    .optional()
}

pub fn list_books(conn: &Connection) -> rusqlite::Result<Vec<Book>> {
    let mut stmt = conn.prepare(&format!("{BOOK_SELECT} ORDER BY b.added_at DESC"))?;
    let rows = stmt.query_map([], row_to_book)?;
    rows.collect()
}

pub fn insert_book(conn: &Connection, b: &NewBook) -> rusqlite::Result<i64> {
    let m = &b.meta;
    conn.query_row(
        "INSERT INTO books (hash, path, format, managed, file_size, added_at, title, authors,
                            series, series_index, language, publisher, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         RETURNING id",
        params![
            b.hash,
            b.path,
            b.format,
            b.managed,
            b.file_size,
            now(),
            m.title,
            m.authors,
            m.series,
            m.series_index,
            m.language,
            m.publisher,
            m.description
        ],
        |r| r.get(0),
    )
}

pub fn book_hash(conn: &Connection, id: i64) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT hash FROM books WHERE id = ?1", [id], |r| r.get(0))
        .optional()
}

pub fn set_path(conn: &Connection, id: i64, path: &str, managed: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE books SET path = ?2, managed = ?3 WHERE id = ?1",
        params![id, path, managed],
    )?;
    Ok(())
}

pub fn mark_opened(conn: &Connection, id: i64) -> rusqlite::Result<Option<Book>> {
    conn.execute(
        "UPDATE books SET last_opened_at = ?2 WHERE id = ?1",
        params![id, now()],
    )?;
    get_book(conn, id)
}

/// Replaces all descriptive metadata (used by the metadata editor).
pub fn update_metadata(conn: &Connection, id: i64, m: &Metadata) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE books SET title = ?2, authors = ?3, series = ?4, series_index = ?5, language = ?6,
                          publisher = ?7, description = ?8
         WHERE id = ?1",
        params![
            id,
            m.title,
            m.authors,
            m.series,
            m.series_index,
            m.language,
            m.publisher,
            m.description
        ],
    )?;
    Ok(())
}

/// Fills only fields that are still empty, so user edits are never overwritten by
/// metadata the reader discovers later.
pub fn fill_missing_metadata(conn: &Connection, id: i64, m: &Metadata) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE books SET title = COALESCE(title, ?2), authors = COALESCE(authors, ?3),
                          series = COALESCE(series, ?4), series_index = COALESCE(series_index, ?5),
                          language = COALESCE(language, ?6), publisher = COALESCE(publisher, ?7),
                          description = COALESCE(description, ?8)
         WHERE id = ?1",
        params![
            id,
            m.title,
            m.authors,
            m.series,
            m.series_index,
            m.language,
            m.publisher,
            m.description
        ],
    )?;
    Ok(())
}

pub fn set_cover_path(conn: &Connection, id: i64, cover: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE books SET cover_path = ?2 WHERE id = ?1",
        params![id, cover],
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

pub fn remove_book(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM books WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_collections(conn: &Connection) -> rusqlite::Result<Vec<Collection>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, COUNT(cb.book_id) FROM collections c
         LEFT JOIN collection_books cb ON cb.collection_id = c.id
         GROUP BY c.id ORDER BY c.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Collection {
            id: r.get(0)?,
            name: r.get(1)?,
            book_count: r.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn create_collection(conn: &Connection, name: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "INSERT INTO collections (name, created_at) VALUES (?1, ?2) RETURNING id",
        params![name.trim(), now()],
        |r| r.get(0),
    )
}

pub fn rename_collection(conn: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE collections SET name = ?2 WHERE id = ?1",
        params![id, name.trim()],
    )?;
    Ok(())
}

pub fn delete_collection(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM collections WHERE id = ?1", [id])?;
    Ok(())
}

pub fn set_in_collection(
    conn: &Connection,
    collection_id: i64,
    book_id: i64,
    member: bool,
) -> rusqlite::Result<()> {
    if member {
        conn.execute(
            "INSERT OR IGNORE INTO collection_books (collection_id, book_id, added_at) VALUES (?1, ?2, ?3)",
            params![collection_id, book_id, now()],
        )?;
    } else {
        conn.execute(
            "DELETE FROM collection_books WHERE collection_id = ?1 AND book_id = ?2",
            params![collection_id, book_id],
        )?;
    }
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

    fn add(conn: &Connection, hash: &str, title: Option<&str>) -> i64 {
        insert_book(
            conn,
            &NewBook {
                hash: hash.into(),
                path: format!("/{hash}.epub"),
                format: "epub".into(),
                meta: Metadata {
                    title: title.map(Into::into),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .unwrap()
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
    fn migrates_existing_v1_database() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&format!("{}; PRAGMA user_version = 1;", MIGRATIONS[0]))
            .unwrap();
        conn.execute(
            "INSERT INTO books (hash, path, format, title, added_at) VALUES ('h', '/b.epub', 'epub', 'Old', 1)",
            [],
        )
        .unwrap();
        init(&conn).unwrap();
        let book = find_by_hash(&conn, "h").unwrap().unwrap();
        assert_eq!(book.title.as_deref(), Some("Old"));
        assert!(!book.managed);
        assert!(book.collection_ids.is_empty());
    }

    #[test]
    fn hash_is_unique() {
        let conn = mem();
        add(&conn, "abc", None);
        let dup = insert_book(
            &conn,
            &NewBook {
                hash: "abc".into(),
                ..Default::default()
            },
        );
        assert!(dup.is_err());
        assert!(find_by_hash(&conn, "abc").unwrap().is_some());
    }

    #[test]
    fn progress_round_trips_and_clamps() {
        let conn = mem();
        let id = add(&conn, "h", None);
        assert!(get_book(&conn, id).unwrap().unwrap().progress.is_none());
        save_progress(&conn, id, "epubcfi(/6/4!/4/2)", 1.7).unwrap();
        assert_eq!(
            get_book(&conn, id).unwrap().unwrap().progress,
            Some(Progress {
                cfi: "epubcfi(/6/4!/4/2)".into(),
                fraction: 1.0
            })
        );
    }

    #[test]
    fn fill_missing_metadata_never_overwrites() {
        let conn = mem();
        let id = add(&conn, "h", Some("Edited Title"));
        fill_missing_metadata(
            &conn,
            id,
            &Metadata {
                title: Some("File Title".into()),
                authors: Some("Author".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let b = get_book(&conn, id).unwrap().unwrap();
        assert_eq!(b.title.as_deref(), Some("Edited Title"));
        assert_eq!(b.authors.as_deref(), Some("Author"));
    }

    #[test]
    fn update_metadata_replaces_fields() {
        let conn = mem();
        let id = add(&conn, "h", Some("T"));
        let m = Metadata {
            title: Some("New".into()),
            series: Some("Saga".into()),
            series_index: Some(2.0),
            ..Default::default()
        };
        update_metadata(&conn, id, &m).unwrap();
        let b = get_book(&conn, id).unwrap().unwrap();
        assert_eq!(b.title.as_deref(), Some("New"));
        assert_eq!(b.series.as_deref(), Some("Saga"));
        assert_eq!(b.series_index, Some(2.0));
    }

    #[test]
    fn metadata_normalization() {
        let m = Metadata {
            title: Some("  Dune ".into()),
            authors: Some("   ".into()),
            series_index: Some(f64::NAN),
            ..Default::default()
        }
        .normalized();
        assert_eq!(m.title.as_deref(), Some("Dune"));
        assert_eq!(m.authors, None);
        assert_eq!(m.series_index, None);
    }

    #[test]
    fn collections_membership_and_cascade() {
        let conn = mem();
        let a = add(&conn, "a", Some("A"));
        let b = add(&conn, "b", Some("B"));
        let c = create_collection(&conn, " To Read ").unwrap();
        assert!(
            create_collection(&conn, "to read").is_err(),
            "names are case-insensitively unique"
        );
        set_in_collection(&conn, c, a, true).unwrap();
        set_in_collection(&conn, c, a, true).unwrap();
        set_in_collection(&conn, c, b, true).unwrap();
        assert_eq!(get_book(&conn, a).unwrap().unwrap().collection_ids, vec![c]);
        let cols = list_collections(&conn).unwrap();
        assert_eq!(cols[0].name, "To Read");
        assert_eq!(cols[0].book_count, 2);

        set_in_collection(&conn, c, b, false).unwrap();
        remove_book(&conn, a).unwrap();
        assert_eq!(list_collections(&conn).unwrap()[0].book_count, 0);

        rename_collection(&conn, c, "Favorites").unwrap();
        delete_collection(&conn, c).unwrap();
        assert!(list_collections(&conn).unwrap().is_empty());
        assert!(get_book(&conn, b)
            .unwrap()
            .unwrap()
            .collection_ids
            .is_empty());
    }

    #[test]
    fn mark_opened_sets_timestamp() {
        let conn = mem();
        let id = add(&conn, "h", None);
        assert!(get_book(&conn, id)
            .unwrap()
            .unwrap()
            .last_opened_at
            .is_none());
        assert!(mark_opened(&conn, id)
            .unwrap()
            .unwrap()
            .last_opened_at
            .is_some());
    }
}
