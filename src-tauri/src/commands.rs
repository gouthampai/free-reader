//! Tauri commands exposed to the frontend.

use crate::annotations::{self, Annotation, NewAnnotation};
use crate::covers;
use crate::db::{self, Book, Collection, Metadata};
use crate::error::{Error, Result};
use crate::fulltext::{self, IndexStatus, TextHit};
use crate::library::{self, Dirs, ImportFailure, ImportSummary, Outcome};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub dirs: Dirs,
    /// Book path passed on the command line (Windows file associations, `free-reader book.epub`).
    pub launch_path: Mutex<Option<String>>,
    /// Wakes the background full-text indexer.
    pub indexer: mpsc::Sender<()>,
}

impl AppState {
    fn book(&self, id: i64) -> Result<Book> {
        db::get_book(&self.db.lock().unwrap(), id)?.ok_or(Error::NotFound)
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| Error::Io(std::io::Error::other(e)))?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgress {
    done: usize,
    total: usize,
    current: String,
}

/// Imports files and folders. `copy` stores copies in the managed library folder; otherwise
/// books are linked in place. Emits `import-progress` events as files are processed.
#[tauri::command]
pub async fn import_books(app: AppHandle, paths: Vec<String>, copy: bool) -> Result<ImportSummary> {
    blocking(move || {
        let state = app.state::<AppState>();
        let files = library::collect_files(&paths.iter().map(PathBuf::from).collect::<Vec<_>>());
        let total = files.len();
        let mut summary = ImportSummary::default();
        for (i, file) in files.iter().enumerate() {
            let _ = app.emit(
                "import-progress",
                ImportProgress {
                    done: i,
                    total,
                    current: file
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                },
            );
            match library::import_file(&state.db, &state.dirs, file, copy) {
                Ok(Outcome::Added(id)) => summary.added.push(id),
                Ok(Outcome::Duplicate(id)) => summary.duplicates.push(id),
                Err(e) => summary.failed.push(ImportFailure {
                    path: file.to_string_lossy().into_owned(),
                    error: e.to_string(),
                }),
            }
        }
        if !summary.added.is_empty() {
            let _ = state.indexer.send(());
        }
        let _ = app.emit(
            "import-progress",
            ImportProgress {
                done: total,
                total,
                current: String::new(),
            },
        );
        Ok(summary)
    })
    .await
}

#[tauri::command]
pub fn list_books(state: State<'_, AppState>) -> Result<Vec<Book>> {
    Ok(db::list_books(&state.db.lock().unwrap())?)
}

/// Marks a book as opened (for "Continue reading") and returns it with saved progress.
#[tauri::command]
pub fn mark_opened(state: State<'_, AppState>, id: i64) -> Result<Book> {
    db::mark_opened(&state.db.lock().unwrap(), id)?.ok_or(Error::NotFound)
}

/// Returns the raw bytes of a registered book. Only library paths are readable.
#[tauri::command]
pub async fn read_book(state: State<'_, AppState>, id: i64) -> Result<Response> {
    let path = state.book(id)?.path;
    let bytes = blocking(move || {
        std::fs::read(&path).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::Invalid(format!("The file is missing: {path}")),
            _ => e.into(),
        })
    })
    .await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn update_metadata(state: State<'_, AppState>, id: i64, metadata: Metadata) -> Result<Book> {
    db::update_metadata(&state.db.lock().unwrap(), id, &metadata.normalized())?;
    state.book(id)
}

/// Fills empty fields with metadata the reader discovered; never overwrites user edits.
#[tauri::command]
pub fn fill_missing_metadata(
    state: State<'_, AppState>,
    id: i64,
    metadata: Metadata,
) -> Result<()> {
    Ok(db::fill_missing_metadata(
        &state.db.lock().unwrap(),
        id,
        &metadata.normalized(),
    )?)
}

fn store_cover(state: &AppState, id: i64, bytes: &[u8]) -> Result<Book> {
    state.book(id)?;
    let path = covers::store(&state.dirs.covers, id, bytes)?;
    db::set_cover_path(&state.db.lock().unwrap(), id, Some(&path.to_string_lossy()))?;
    state.book(id)
}

/// Sets a cover from raw image bytes in the request body; the book id is in `x-book-id`.
#[tauri::command]
pub fn set_cover_bytes(state: State<'_, AppState>, request: Request<'_>) -> Result<Book> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Invalid("expected raw image bytes".into()));
    };
    let id = request
        .headers()
        .get("x-book-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| Error::Invalid("missing x-book-id header".into()))?;
    store_cover(&state, id, bytes)
}

#[tauri::command]
pub async fn set_cover_from_file(
    state: State<'_, AppState>,
    id: i64,
    path: String,
) -> Result<Book> {
    let bytes = blocking(move || Ok(std::fs::read(path)?)).await?;
    store_cover(&state, id, &bytes)
}

#[tauri::command]
pub fn save_progress(
    state: State<'_, AppState>,
    id: i64,
    cfi: String,
    fraction: f64,
) -> Result<()> {
    Ok(db::save_progress(
        &state.db.lock().unwrap(),
        id,
        &cfi,
        fraction,
    )?)
}

/// Removes a book. Managed copies are deleted; linked files are left on disk.
#[tauri::command]
pub fn remove_book(state: State<'_, AppState>, id: i64) -> Result<()> {
    library::remove_book(&state.db, &state.dirs, id)
}

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> Result<Vec<Collection>> {
    Ok(db::list_collections(&state.db.lock().unwrap())?)
}

fn collection_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() {
        Err(Error::Invalid("Collection name can't be empty".into()))
    } else {
        Ok(name)
    }
}

fn friendly_unique_error(e: rusqlite::Error, name: &str) -> Error {
    match e {
        rusqlite::Error::SqliteFailure(f, _)
            if f.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            Error::Invalid(format!("A collection named \"{name}\" already exists"))
        }
        e => e.into(),
    }
}

#[tauri::command]
pub fn create_collection(state: State<'_, AppState>, name: String) -> Result<i64> {
    let name = collection_name(&name)?;
    db::create_collection(&state.db.lock().unwrap(), name)
        .map_err(|e| friendly_unique_error(e, name))
}

#[tauri::command]
pub fn rename_collection(state: State<'_, AppState>, id: i64, name: String) -> Result<()> {
    let name = collection_name(&name)?;
    db::rename_collection(&state.db.lock().unwrap(), id, name)
        .map_err(|e| friendly_unique_error(e, name))
}

#[tauri::command]
pub fn delete_collection(state: State<'_, AppState>, id: i64) -> Result<()> {
    Ok(db::delete_collection(&state.db.lock().unwrap(), id)?)
}

#[tauri::command]
pub fn set_in_collection(
    state: State<'_, AppState>,
    collection_id: i64,
    book_ids: Vec<i64>,
    member: bool,
) -> Result<()> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction()?;
    for id in book_ids {
        db::set_in_collection(&tx, collection_id, id, member)?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn list_annotations(state: State<'_, AppState>, book_id: i64) -> Result<Vec<Annotation>> {
    Ok(annotations::list(&state.db.lock().unwrap(), book_id)?)
}

#[tauri::command]
pub fn add_annotation(
    state: State<'_, AppState>,
    book_id: i64,
    annotation: NewAnnotation,
) -> Result<Annotation> {
    state.book(book_id)?;
    Ok(annotations::add(
        &state.db.lock().unwrap(),
        book_id,
        annotation,
    )?)
}

/// Sets the note (None clears it) and, if given, the color.
#[tauri::command]
pub fn update_annotation(
    state: State<'_, AppState>,
    id: i64,
    note: Option<String>,
    color: Option<String>,
) -> Result<Annotation> {
    annotations::update(&state.db.lock().unwrap(), id, note, color)?.ok_or(Error::NotFound)
}

#[tauri::command]
pub fn delete_annotation(state: State<'_, AppState>, id: i64) -> Result<()> {
    Ok(annotations::delete(&state.db.lock().unwrap(), id)?)
}

/// Full-text search across indexed books, best matches first.
#[tauri::command]
pub fn search_text(state: State<'_, AppState>, query: String) -> Result<Vec<TextHit>> {
    Ok(fulltext::search(&state.db.lock().unwrap(), &query, 300)?)
}

#[tauri::command]
pub fn index_status(state: State<'_, AppState>) -> Result<IndexStatus> {
    Ok(fulltext::status(&state.db.lock().unwrap())?)
}

/// Returns the launch path once, so a reload doesn't reopen it.
#[tauri::command]
pub fn take_launch_path(state: State<'_, AppState>) -> Option<String> {
    state.launch_path.lock().unwrap().take()
}
