//! Files the OS asks us to open: command-line arguments (Windows/Linux file associations,
//! `free-reader book.epub`) and, on macOS, Finder double-clicks and "Open With". They queue here
//! until the frontend takes them, so none are lost if they arrive before the UI is listening.

use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Emitted when paths are queued while the app is running; the frontend then takes them.
pub const PENDING_EVENT: &str = "pending-opens";

#[derive(Default)]
pub struct PendingOpens(Mutex<Vec<String>>);

impl PendingOpens {
    pub fn push(&self, paths: impl IntoIterator<Item = String>) {
        let mut q = self.0.lock().unwrap();
        for p in paths {
            if !q.contains(&p) {
                q.push(p);
            }
        }
    }

    /// Takes everything queued. Taking is atomic, so a startup take and an event-driven take
    /// can't both open the same file.
    pub fn take(&self) -> Vec<String> {
        std::mem::take(&mut *self.0.lock().unwrap())
    }
}

/// Book paths among the process arguments (skipping the executable and flags).
pub fn from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && Path::new(a).is_file())
        .collect()
}

/// Local paths from the file URLs macOS hands us.
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn from_urls(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Queues paths, tells the frontend, and brings the window forward.
pub fn enqueue<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    app.state::<PendingOpens>().push(paths);
    let _ = app.emit(PENDING_EVENT, ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_dedupes_and_take_empties() {
        let q = PendingOpens::default();
        q.push(["/a.epub".to_string(), "/b.pdf".to_string()]);
        q.push(["/a.epub".to_string()]);
        assert_eq!(q.take(), vec!["/a.epub", "/b.pdf"]);
        assert!(q.take().is_empty());
    }

    #[test]
    fn args_keep_existing_files_only() {
        let dir = std::env::temp_dir().join(format!("fr-opens-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let book = dir.join("book.epub");
        std::fs::write(&book, b"x").unwrap();
        let book = book.to_string_lossy().into_owned();
        let args = ["free-reader", "--flag", &book, "/does/not/exist.epub"].map(String::from);
        assert_eq!(from_args(args), vec![book]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn converts_file_urls() {
        let urls = [
            tauri::Url::parse("file:///Users/me/My%20Book.epub").unwrap(),
            tauri::Url::parse("https://example.com/x.epub").unwrap(),
        ];
        assert_eq!(from_urls(&urls), vec!["/Users/me/My Book.epub"]);
    }
}
