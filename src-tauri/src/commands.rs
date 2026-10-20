//! Tauri commands exposed to the frontend.

use crate::db::{self, Book};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::State;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("unsupported file type: {0}")]
    Unsupported(String),
    #[error("book not found")]
    NotFound,
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, Error>;

pub const SUPPORTED_FORMATS: &[&str] = &["epub", "mobi", "azw", "azw3", "fb2", "fbz", "cbz"];

fn format_of(path: &Path) -> Result<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if SUPPORTED_FORMATS.contains(&ext.as_str()) {
        Ok(ext)
    } else {
        Err(Error::Unsupported(path.display().to_string()))
    }
}

fn hash_file(path: &Path) -> Result<String> {
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

/// Registers the file at `path` in the library and returns it with any saved progress.
#[tauri::command]
pub async fn open_book(state: State<'_, AppState>, path: String) -> Result<Book> {
    let p = Path::new(&path);
    let format = format_of(p)?;
    let hash = {
        let p = p.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || hash_file(&p))
            .await
            .map_err(|e| Error::Io(std::io::Error::other(e)))??
    };
    let conn = state.db.lock().unwrap();
    Ok(db::upsert_opened(&conn, &hash, &path, &format)?)
}

/// Returns the raw bytes of a registered book. Only library paths are readable.
#[tauri::command]
pub async fn read_book(state: State<'_, AppState>, id: i64) -> Result<Response> {
    let path = {
        let conn = state.db.lock().unwrap();
        db::get_book(&conn, id)?.ok_or(Error::NotFound)?.path
    };
    let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|e| Error::Io(std::io::Error::other(e)))??;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn set_book_metadata(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    authors: Option<String>,
) -> Result<()> {
    let conn = state.db.lock().unwrap();
    Ok(db::set_metadata(
        &conn,
        id,
        title.as_deref(),
        authors.as_deref(),
    )?)
}

#[tauri::command]
pub fn save_progress(
    state: State<'_, AppState>,
    id: i64,
    cfi: String,
    fraction: f64,
) -> Result<()> {
    let conn = state.db.lock().unwrap();
    Ok(db::save_progress(&conn, id, &cfi, fraction)?)
}

#[tauri::command]
pub fn recent_books(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<Book>> {
    let conn = state.db.lock().unwrap();
    Ok(db::recent_books(&conn, limit.unwrap_or(24))?)
}

#[tauri::command]
pub fn remove_book(state: State<'_, AppState>, id: i64) -> Result<()> {
    let conn = state.db.lock().unwrap();
    Ok(db::remove_book(&conn, id)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_supported_formats_case_insensitively() {
        assert_eq!(format_of(Path::new("/a/Book.EPUB")).unwrap(), "epub");
        assert_eq!(format_of(Path::new("x.azw3")).unwrap(), "azw3");
        assert!(format_of(Path::new("notes.txt")).is_err());
        assert!(format_of(Path::new("noext")).is_err());
    }

    #[test]
    fn hashes_file_contents() {
        let dir = std::env::temp_dir().join(format!("free-reader-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.epub");
        std::fs::write(&f, b"abc").unwrap();
        assert_eq!(
            hash_file(&f).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
