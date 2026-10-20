//! Highlights, notes and bookmarks, anchored to EPUB CFIs.

use crate::db::now;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Highlight,
    Bookmark,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Highlight => "highlight",
            Kind::Bookmark => "bookmark",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: i64,
    pub book_id: i64,
    pub kind: Kind,
    pub cfi: String,
    /// The highlighted text, or an excerpt of the page for bookmarks. Kept so annotations
    /// stay readable (and exportable) even if the CFI can no longer be resolved.
    pub text: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    pub chapter: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAnnotation {
    pub kind: Kind,
    pub cfi: String,
    pub text: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    pub chapter: Option<String>,
}

const SELECT: &str =
    "SELECT id, book_id, kind, cfi, text, note, color, chapter, created_at, updated_at
                      FROM annotations";

fn row(r: &rusqlite::Row) -> rusqlite::Result<Annotation> {
    let kind: String = r.get(2)?;
    Ok(Annotation {
        id: r.get(0)?,
        book_id: r.get(1)?,
        kind: if kind == "bookmark" {
            Kind::Bookmark
        } else {
            Kind::Highlight
        },
        cfi: r.get(3)?,
        text: r.get(4)?,
        note: r.get(5)?,
        color: r.get(6)?,
        chapter: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
    })
}

fn clean(s: Option<String>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

pub fn get(conn: &Connection, id: i64) -> rusqlite::Result<Option<Annotation>> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], row)
        .optional()
}

/// All annotations for a book, oldest first. The UI orders them by position (CFI).
pub fn list(conn: &Connection, book_id: i64) -> rusqlite::Result<Vec<Annotation>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE book_id = ?1 ORDER BY created_at, id"
    ))?;
    let rows = stmt.query_map([book_id], row)?;
    rows.collect()
}

pub fn add(conn: &Connection, book_id: i64, a: NewAnnotation) -> rusqlite::Result<Annotation> {
    let ts = now();
    let id: i64 = conn.query_row(
        "INSERT INTO annotations (book_id, kind, cfi, text, note, color, chapter, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id",
        params![
            book_id,
            a.kind.as_str(),
            a.cfi,
            clean(a.text),
            clean(a.note),
            clean(a.color),
            clean(a.chapter),
            ts
        ],
        |r| r.get(0),
    )?;
    Ok(get(conn, id)?.expect("annotation just inserted"))
}

pub fn update(
    conn: &Connection,
    id: i64,
    note: Option<String>,
    color: Option<String>,
) -> rusqlite::Result<Option<Annotation>> {
    conn.execute(
        "UPDATE annotations SET note = ?2, color = COALESCE(?3, color), updated_at = ?4 WHERE id = ?1",
        params![id, clean(note), clean(color), now()],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM annotations WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, Metadata, NewBook};

    fn setup() -> (Connection, i64) {
        let conn = Connection::open_in_memory().unwrap();
        db::init(&conn).unwrap();
        let id = db::insert_book(
            &conn,
            &NewBook {
                hash: "h".into(),
                path: "/b.epub".into(),
                format: "epub".into(),
                meta: Metadata::default(),
                ..Default::default()
            },
        )
        .unwrap();
        (conn, id)
    }

    fn highlight(cfi: &str) -> NewAnnotation {
        NewAnnotation {
            kind: Kind::Highlight,
            cfi: cfi.into(),
            text: Some(" It was a dark night ".into()),
            note: Some("   ".into()),
            color: Some("yellow".into()),
            chapter: Some("Chapter 1".into()),
        }
    }

    #[test]
    fn add_list_update_delete() {
        let (conn, book) = setup();
        let a = add(&conn, book, highlight("epubcfi(/6/4!/4/2,/1:0,/1:5)")).unwrap();
        assert_eq!(a.text.as_deref(), Some("It was a dark night"));
        assert_eq!(a.note, None, "blank notes are stored as NULL");
        let b = add(
            &conn,
            book,
            NewAnnotation {
                kind: Kind::Bookmark,
                cfi: "epubcfi(/6/8!/4/2/1:0)".into(),
                text: None,
                note: None,
                color: None,
                chapter: None,
            },
        )
        .unwrap();
        assert_eq!(
            list(&conn, book)
                .unwrap()
                .iter()
                .map(|x| x.id)
                .collect::<Vec<_>>(),
            vec![a.id, b.id]
        );

        let u = update(&conn, a.id, Some("Great line".into()), None)
            .unwrap()
            .unwrap();
        assert_eq!(u.note.as_deref(), Some("Great line"));
        assert_eq!(
            u.color.as_deref(),
            Some("yellow"),
            "color kept when not given"
        );
        let u = update(&conn, a.id, None, Some("blue".into()))
            .unwrap()
            .unwrap();
        assert_eq!(u.note, None, "note cleared");
        assert_eq!(u.color.as_deref(), Some("blue"));

        delete(&conn, a.id).unwrap();
        assert_eq!(list(&conn, book).unwrap().len(), 1);
    }

    #[test]
    fn annotations_are_removed_with_their_book() {
        let (conn, book) = setup();
        add(&conn, book, highlight("epubcfi(/6/4!/4/2,/1:0,/1:5)")).unwrap();
        db::remove_book(&conn, book).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn rejects_unknown_kind_at_the_database_level() {
        let (conn, book) = setup();
        let r = conn.execute(
            "INSERT INTO annotations (book_id, kind, cfi, created_at, updated_at) VALUES (?1, 'scribble', 'x', 0, 0)",
            [book],
        );
        assert!(r.is_err());
    }
}
