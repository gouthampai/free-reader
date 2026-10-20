//! Import pipeline: discover files, de-duplicate by content hash, copy or link, extract metadata.

use crate::db::{self, NewBook};
use crate::error::{Error, Result};
use crate::{covers, epub};
use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const SUPPORTED_FORMATS: &[&str] = &["epub", "mobi", "azw", "azw3", "fb2", "fbz", "cbz", "pdf"];

/// Where the library keeps its own files.
#[derive(Debug, Clone)]
pub struct Dirs {
    /// Managed copies of imported books.
    pub books: PathBuf,
    pub covers: PathBuf,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Outcome {
    Added(i64),
    Duplicate(i64),
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub added: Vec<i64>,
    pub duplicates: Vec<i64>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Serialize)]
pub struct ImportFailure {
    pub path: String,
    pub error: String,
}

pub fn format_of(path: &Path) -> Result<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if SUPPORTED_FORMATS.contains(&ext.as_str()) {
        Ok(ext)
    } else {
        Err(Error::Unsupported(
            path.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.display().to_string()),
        ))
    }
}

pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with('.'))
}

/// Expands folders (recursively) into supported book files. Explicitly listed files are kept
/// even if unsupported so the user gets an error for them rather than silence.
pub fn collect_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() {
            let mut found: Vec<PathBuf> = walkdir::WalkDir::new(p)
                .into_iter()
                .filter_entry(|e| e.depth() == 0 || !is_hidden(e.path()))
                .flatten()
                .filter(|e| e.file_type().is_file() && format_of(e.path()).is_ok())
                .map(|e| e.into_path())
                .collect();
            found.sort();
            out.extend(found);
        } else {
            out.push(p.clone());
        }
    }
    out.dedup();
    out
}

/// Strips characters that are invalid in file names on Windows or macOS.
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').to_string();
    if trimmed.is_empty() {
        "book".into()
    } else {
        trimmed
    }
}

/// Copies `src` into `dir`, choosing a free name ("Book (2).epub") if needed.
fn copy_into(dir: &Path, src: &Path) -> Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let stem = sanitize_file_name(&src.file_stem().unwrap_or_default().to_string_lossy());
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    for n in 1.. {
        let name = if n == 1 {
            format!("{stem}.{ext}")
        } else {
            format!("{stem} ({n}).{ext}")
        };
        let dest = dir.join(name);
        // create_new avoids racing another import for the same name.
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&dest)
        {
            Ok(_) => {
                if let Err(e) = fs::copy(src, &dest) {
                    let _ = fs::remove_file(&dest);
                    return Err(e.into());
                }
                return Ok(dest);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    unreachable!()
}

/// Places the book file per the import mode; returns (path, managed).
fn place(dirs: &Dirs, src: &Path, copy: bool) -> Result<(PathBuf, bool)> {
    let src = std::path::absolute(src)?;
    if src.starts_with(&dirs.books) {
        Ok((src, true))
    } else if copy {
        Ok((copy_into(&dirs.books, &src)?, true))
    } else {
        Ok((src, false))
    }
}

pub fn import_file(db: &Mutex<Connection>, dirs: &Dirs, src: &Path, copy: bool) -> Result<Outcome> {
    let format = format_of(src)?;
    if !src.is_file() {
        return Err(Error::Invalid(format!("not a file: {}", src.display())));
    }
    let hash = hash_file(src)?;

    let existing = db::find_by_hash(&db.lock().unwrap(), &hash)?;
    if let Some(book) = existing {
        // Same content already in the library. If its file went missing, adopt this copy.
        if !Path::new(&book.path).exists() {
            let (path, managed) = place(dirs, src, copy)?;
            db::set_path(
                &db.lock().unwrap(),
                book.id,
                &path.to_string_lossy(),
                managed,
            )?;
        }
        return Ok(Outcome::Duplicate(book.id));
    }

    // Metadata problems shouldn't block importing; the reader fills gaps on first open.
    let extracted = if format == "epub" {
        File::open(src)
            .map_err(epub::EpubError::from)
            .and_then(|f| epub::extract(BufReader::new(f)))
            .map_err(|e| log::warn!("metadata extraction failed for {}: {e}", src.display()))
            .ok()
    } else {
        None
    };
    let (meta, cover) = extracted.map(|x| (x.meta, x.cover)).unwrap_or_default();

    let (path, managed) = place(dirs, src, copy)?;
    let new = NewBook {
        hash,
        path: path.to_string_lossy().into_owned(),
        format,
        managed,
        file_size: fs::metadata(&path).ok().map(|m| m.len() as i64),
        meta,
    };
    let id = match db::insert_book(&db.lock().unwrap(), &new) {
        Ok(id) => id,
        Err(e) => {
            if managed && !src.starts_with(&dirs.books) {
                let _ = fs::remove_file(&path);
            }
            return Err(e.into());
        }
    };

    if let Some(bytes) = cover {
        match covers::store(&dirs.covers, id, &bytes) {
            Ok(p) => db::set_cover_path(&db.lock().unwrap(), id, Some(&p.to_string_lossy()))?,
            Err(e) => log::warn!("cover extraction failed for {}: {e}", src.display()),
        }
    }
    Ok(Outcome::Added(id))
}

/// Removes a book from the library, deleting its cover and, for managed books, its file.
pub fn remove_book(db: &Mutex<Connection>, dirs: &Dirs, id: i64) -> Result<()> {
    let book = db::get_book(&db.lock().unwrap(), id)?.ok_or(Error::NotFound)?;
    db::remove_book(&db.lock().unwrap(), id)?;
    covers::remove(&dirs.covers, id);
    if book.managed && Path::new(&book.path).starts_with(&dirs.books) {
        match fs::remove_file(&book.path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::epub::tests::build_epub;

    struct Fixture {
        root: PathBuf,
        dirs: Dirs,
        db: Mutex<Connection>,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!("fr-lib-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join("src")).unwrap();
            let conn = Connection::open_in_memory().unwrap();
            db::init(&conn).unwrap();
            Fixture {
                dirs: Dirs {
                    books: root.join("books"),
                    covers: root.join("covers"),
                },
                db: Mutex::new(conn),
                root,
            }
        }
        fn write(&self, rel: &str, data: &[u8]) -> PathBuf {
            let p = self.root.join("src").join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, data).unwrap();
            p
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn sample_epub(title: &str) -> Vec<u8> {
        build_epub(
            &format!(
                r#"<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:title>{title}</dc:title><dc:creator>Someone</dc:creator></metadata>
                <manifest/></package>"#
            ),
            &[],
        )
    }

    #[test]
    fn detects_supported_formats_case_insensitively() {
        assert_eq!(format_of(Path::new("/a/Book.EPUB")).unwrap(), "epub");
        assert_eq!(format_of(Path::new("x.azw3")).unwrap(), "azw3");
        assert!(format_of(Path::new("notes.txt")).is_err());
        assert!(format_of(Path::new("noext")).is_err());
    }

    #[test]
    fn hashes_file_contents() {
        let f = Fixture::new("hash");
        let p = f.write("a.epub", b"abc");
        assert_eq!(
            hash_file(&p).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn collects_supported_files_recursively_skipping_hidden() {
        let f = Fixture::new("collect");
        f.write("b.epub", b"1");
        f.write("sub/a.mobi", b"2");
        f.write("sub/notes.txt", b"3");
        f.write(".hidden/c.epub", b"4");
        let explicit = f.write("x.txt", b"5");
        let files = collect_files(&[f.root.join("src"), explicit.clone()]);
        let names: Vec<_> = files
            .iter()
            .map(|p| p.strip_prefix(f.root.join("src")).unwrap().to_path_buf())
            .collect();
        assert_eq!(
            names,
            vec![
                PathBuf::from("b.epub"),
                PathBuf::from("sub/a.mobi"),
                PathBuf::from("x.txt")
            ]
        );
    }

    #[test]
    fn copy_import_extracts_metadata_and_dedupes() {
        let f = Fixture::new("copy");
        let src = f.write("My:Book.epub", &sample_epub("Copied"));
        let Outcome::Added(id) = import_file(&f.db, &f.dirs, &src, true).unwrap() else {
            panic!("expected Added")
        };
        let book = db::get_book(&f.db.lock().unwrap(), id).unwrap().unwrap();
        assert!(book.managed);
        assert_eq!(
            Path::new(&book.path),
            f.dirs.books.join("My_Book.epub").as_path()
        );
        assert_eq!(book.title.as_deref(), Some("Copied"));
        assert_eq!(book.authors.as_deref(), Some("Someone"));

        // Same content under another name is a duplicate.
        let again = f.write("other.epub", &sample_epub("Copied"));
        assert_eq!(
            import_file(&f.db, &f.dirs, &again, true).unwrap(),
            Outcome::Duplicate(id)
        );
        assert_eq!(fs::read_dir(&f.dirs.books).unwrap().count(), 1);

        // Removing a managed book deletes its file.
        remove_book(&f.db, &f.dirs, id).unwrap();
        assert!(!Path::new(&book.path).exists());
        assert!(src.exists(), "the original is never touched");
    }

    #[test]
    fn copy_picks_unique_names() {
        let f = Fixture::new("names");
        let a = f.write("a/Book.epub", &sample_epub("One"));
        let b = f.write("b/Book.epub", &sample_epub("Two"));
        import_file(&f.db, &f.dirs, &a, true).unwrap();
        import_file(&f.db, &f.dirs, &b, true).unwrap();
        assert!(f.dirs.books.join("Book.epub").exists());
        assert!(f.dirs.books.join("Book (2).epub").exists());
    }

    #[test]
    fn link_import_keeps_file_in_place_and_relinks_missing() {
        let f = Fixture::new("link");
        let src = f.write("linked.mobi", b"mobi bytes");
        let Outcome::Added(id) = import_file(&f.db, &f.dirs, &src, false).unwrap() else {
            panic!("expected Added")
        };
        let book = db::get_book(&f.db.lock().unwrap(), id).unwrap().unwrap();
        assert!(!book.managed);
        assert_eq!(Path::new(&book.path), src.as_path());
        assert_eq!(
            book.title, None,
            "non-EPUB metadata is filled by the reader"
        );

        // The file moves; re-importing it from the new location relinks the existing book.
        let moved = f.root.join("src/moved.mobi");
        fs::rename(&src, &moved).unwrap();
        assert_eq!(
            import_file(&f.db, &f.dirs, &moved, false).unwrap(),
            Outcome::Duplicate(id)
        );
        let book = db::get_book(&f.db.lock().unwrap(), id).unwrap().unwrap();
        assert_eq!(Path::new(&book.path), moved.as_path());

        // Removing a linked book leaves the file alone.
        remove_book(&f.db, &f.dirs, id).unwrap();
        assert!(moved.exists());
    }

    #[test]
    fn broken_epub_still_imports() {
        let f = Fixture::new("broken");
        let src = f.write("broken.epub", b"definitely not a zip");
        assert!(matches!(
            import_file(&f.db, &f.dirs, &src, false).unwrap(),
            Outcome::Added(_)
        ));
    }

    #[test]
    fn rejects_unsupported_files() {
        let f = Fixture::new("unsupported");
        let src = f.write("notes.txt", b"hi");
        assert!(matches!(
            import_file(&f.db, &f.dirs, &src, true),
            Err(Error::Unsupported(_))
        ));
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("a/b:c*?"), "a_b_c__");
        assert_eq!(sanitize_file_name("  trailing. "), "trailing");
        assert_eq!(sanitize_file_name(""), "book");
    }
}
