mod annotations;
mod commands;
mod covers;
mod db;
mod epub;
mod error;
mod fulltext;
mod library;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("library.db");
            let conn = db::open(&db_path)?;
            let indexer = fulltext::spawn_indexer(db_path);
            let launch_path = std::env::args()
                .skip(1)
                .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file());
            app.manage(AppState {
                db: Mutex::new(conn),
                dirs: library::Dirs {
                    books: dir.join("books"),
                    covers: dir.join("covers"),
                },
                launch_path: Mutex::new(launch_path),
                indexer,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::import_books,
            commands::list_books,
            commands::mark_opened,
            commands::read_book,
            commands::update_metadata,
            commands::fill_missing_metadata,
            commands::set_cover_bytes,
            commands::set_cover_from_file,
            commands::save_progress,
            commands::remove_book,
            commands::list_collections,
            commands::create_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::set_in_collection,
            commands::list_annotations,
            commands::add_annotation,
            commands::update_annotation,
            commands::delete_annotation,
            commands::search_text,
            commands::index_status,
            commands::take_launch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
