//! Library-wide full-text search over EPUB text (SQLite FTS5), indexed in the background.

use crate::db::{self, now};
use crate::epub;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::mpsc;

/// Delimiters around matched terms in snippets; the UI turns them into highlights.
/// Control characters can't appear in book text, so no escaping is needed.
pub const MATCH_START: char = '\u{2}';
pub const MATCH_END: char = '\u{3}';

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextHit {
    pub book_id: i64,
    /// Number of sections (roughly chapters) with matches, within the result limit.
    pub sections: usize,
    pub snippets: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub pending: i64,
    pub indexed: i64,
}

/// Turns user input into a safe FTS5 query: every word must match, the last as a prefix
/// (so results appear while typing). Returns None when there's nothing to search for.
pub fn fts_query(input: &str) -> Option<String> {
    let words: Vec<String> = input
        .split(|c: char| c.is_whitespace() || c == '"')
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .map(|w| format!("\"{w}\""))
        .collect();
    let (last, rest) = words.split_last()?;
    let mut q = rest.join(" ");
    if !q.is_empty() {
        q.push(' ');
    }
    q.push_str(last);
    q.push('*');
    Some(q)
}

/// (Re)indexes one book. Formats other than EPUB, and unreadable files, are marked as indexed
/// with no text so they aren't retried on every launch.
pub fn index_book(
    conn: &mut Connection,
    book_id: i64,
    path: &str,
    format: &str,
) -> rusqlite::Result<usize> {
    let sections = if format == "epub" {
        File::open(path)
            .map_err(epub::EpubError::from)
            .and_then(|f| epub::extract_text(BufReader::new(f)))
            .unwrap_or_else(|e| {
                log::warn!("full-text indexing failed for {path}: {e}");
                Vec::new()
            })
    } else {
        Vec::new()
    };
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM book_sections WHERE book_id = ?1", [book_id])?;
    {
        let mut insert =
            tx.prepare("INSERT INTO book_sections (book_id, section, text) VALUES (?1, ?2, ?3)")?;
        for (i, text) in sections.iter().enumerate() {
            insert.execute(params![book_id, i as i64, text])?;
        }
    }
    tx.execute(
        "UPDATE books SET indexed_at = ?2 WHERE id = ?1",
        params![book_id, now()],
    )?;
    tx.commit()?;
    Ok(sections.len())
}

fn pending(conn: &Connection) -> rusqlite::Result<Vec<(i64, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, format FROM books WHERE indexed_at IS NULL ORDER BY added_at DESC",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    rows.collect()
}

pub fn status(conn: &Connection) -> rusqlite::Result<IndexStatus> {
    conn.query_row(
        "SELECT COUNT(*) FILTER (WHERE indexed_at IS NULL AND format = 'epub'),
                COUNT(*) FILTER (WHERE indexed_at IS NOT NULL AND format = 'epub')
         FROM books",
        [],
        |r| {
            Ok(IndexStatus {
                pending: r.get(0)?,
                indexed: r.get(1)?,
            })
        },
    )
}

pub fn search(conn: &Connection, input: &str, limit: usize) -> rusqlite::Result<Vec<TextHit>> {
    let Some(query) = fts_query(input) else {
        return Ok(Vec::new());
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT s.book_id, snippet(book_text, 0, '{MATCH_START}', '{MATCH_END}', '…', 12)
         FROM book_text JOIN book_sections s ON s.id = book_text.rowid
         WHERE book_text MATCH ?1
         ORDER BY bm25(book_text)
         LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![query, limit as i64], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
    })?;
    // Group by book, keeping the order of each book's best-ranked section.
    let mut hits: Vec<TextHit> = Vec::new();
    for row in rows {
        let (book_id, snippet) = row?;
        match hits.iter_mut().find(|h| h.book_id == book_id) {
            Some(h) => {
                h.sections += 1;
                if h.snippets.len() < 3 {
                    h.snippets.push(snippet);
                }
            }
            None => hits.push(TextHit {
                book_id,
                sections: 1,
                snippets: vec![snippet],
            }),
        }
    }
    Ok(hits)
}

/// Background indexer with its own connection, so long indexing runs never block the UI's
/// queries. Send `()` to wake it after new books are imported.
pub fn spawn_indexer(db_path: PathBuf) -> mpsc::Sender<()> {
    let (tx, rx) = mpsc::channel::<()>();
    std::thread::Builder::new()
        .name("fulltext-indexer".into())
        .spawn(move || {
            let mut conn = match db::open(&db_path) {
                Ok(c) => c,
                Err(e) => return log::error!("full-text indexer couldn't open the database: {e}"),
            };
            loop {
                match pending(&conn) {
                    Ok(books) => {
                        for (id, path, format) in books {
                            if let Err(e) = index_book(&mut conn, id, &path, &format) {
                                log::warn!("full-text indexing failed for book {id}: {e}");
                            }
                        }
                    }
                    Err(e) => log::error!("full-text indexer query failed: {e}"),
                }
                // Block until woken; exit when the app drops the sender.
                if rx.recv().is_err() {
                    return;
                }
                while rx.try_recv().is_ok() {}
            }
        })
        .expect("failed to start indexer thread");
    tx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Metadata, NewBook};
    use crate::epub::tests::build_epub;

    fn setup(name: &str) -> (Connection, PathBuf) {
        let conn = Connection::open_in_memory().unwrap();
        db::init(&conn).unwrap();
        let dir = std::env::temp_dir().join(format!("fr-fts-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        (conn, dir)
    }

    fn add_epub(conn: &Connection, dir: &std::path::Path, name: &str, chapters: &[&str]) -> i64 {
        let manifest: String = (0..chapters.len())
            .map(|i| {
                format!(r#"<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>"#)
            })
            .collect();
        let spine: String = (0..chapters.len())
            .map(|i| format!(r#"<itemref idref="c{i}"/>"#))
            .collect();
        let opf = format!(
            "<package><metadata/><manifest>{manifest}</manifest><spine>{spine}</spine></package>"
        );
        let files: Vec<(String, String)> = chapters
            .iter()
            .enumerate()
            .map(|(i, t)| {
                (
                    format!("OEBPS/c{i}.xhtml"),
                    format!("<html><body><p>{t}</p></body></html>"),
                )
            })
            .collect();
        let refs: Vec<(&str, &[u8])> = files
            .iter()
            .map(|(n, d)| (n.as_str(), d.as_bytes()))
            .collect();
        let path = dir.join(name);
        std::fs::write(&path, build_epub(&opf, &refs)).unwrap();
        db::insert_book(
            conn,
            &NewBook {
                hash: name.into(),
                path: path.to_string_lossy().into(),
                format: "epub".into(),
                meta: Metadata::default(),
                ..Default::default()
            },
        )
        .unwrap()
    }

    #[test]
    fn builds_safe_prefix_queries() {
        assert_eq!(
            fts_query("white whale").as_deref(),
            Some("\"white\" \"whale\"*")
        );
        assert_eq!(
            fts_query(r#"  "Ahab" OR( "#).as_deref(),
            Some("\"Ahab\" \"OR(\"*")
        );
        assert_eq!(fts_query("  - * ").as_deref(), None);
        assert_eq!(fts_query(""), None);
    }

    #[test]
    fn indexes_searches_and_cleans_up() {
        let (mut conn, dir) = setup("search");
        let moby = add_epub(
            &conn,
            &dir,
            "moby.epub",
            &[
                "Call me Ishmael.",
                "The white whale surfaced.",
                "Ahab hunts the whale.",
            ],
        );
        let other = add_epub(
            &conn,
            &dir,
            "other.epub",
            &["A whale of a time.", "Nothing here."],
        );
        assert_eq!(
            status(&conn).unwrap(),
            IndexStatus {
                pending: 2,
                indexed: 0
            }
        );

        for (id, path, format) in pending(&conn).unwrap() {
            index_book(&mut conn, id, &path, &format).unwrap();
        }
        assert_eq!(
            status(&conn).unwrap(),
            IndexStatus {
                pending: 0,
                indexed: 2
            }
        );
        assert!(pending(&conn).unwrap().is_empty());

        let hits = search(&conn, "whale", 100).unwrap();
        assert_eq!(hits.len(), 2);
        let moby_hit = hits.iter().find(|h| h.book_id == moby).unwrap();
        assert_eq!(moby_hit.sections, 2);
        assert!(moby_hit.snippets[0].contains(&format!("{MATCH_START}whale{MATCH_END}")));

        // Prefix match on the last word, AND across words, diacritics ignored.
        assert_eq!(search(&conn, "ishm", 100).unwrap()[0].book_id, moby);
        assert!(search(&conn, "ahab time", 100).unwrap().is_empty());
        assert_eq!(search(&conn, "ÁHAB", 100).unwrap()[0].book_id, moby);

        // Re-indexing replaces rather than duplicates.
        let path = db::get_book(&conn, other).unwrap().unwrap().path;
        index_book(&mut conn, other, &path, "epub").unwrap();
        assert_eq!(
            search(&conn, "whale", 100)
                .unwrap()
                .iter()
                .find(|h| h.book_id == other)
                .unwrap()
                .sections,
            1
        );

        // Deleting a book removes its text from the index via the cascade + trigger.
        db::remove_book(&conn, moby).unwrap();
        assert!(search(&conn, "ishmael", 100).unwrap().is_empty());
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM book_sections", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 2);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn non_epub_and_broken_files_are_marked_done() {
        let (mut conn, dir) = setup("broken");
        let bad = dir.join("bad.epub");
        std::fs::write(&bad, b"not a zip").unwrap();
        let id = db::insert_book(
            &conn,
            &NewBook {
                hash: "bad".into(),
                path: bad.to_string_lossy().into(),
                format: "epub".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            index_book(&mut conn, id, &bad.to_string_lossy(), "epub").unwrap(),
            0
        );
        assert!(pending(&conn).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }
}
