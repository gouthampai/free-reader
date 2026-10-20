mod commands;
mod db;
mod epub;

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
            let conn = db::open(&dir.join("library.db"))?;
            let launch_path = std::env::args()
                .skip(1)
                .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file());
            app.manage(AppState {
                db: Mutex::new(conn),
                launch_path: Mutex::new(launch_path),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_book,
            commands::read_book,
            commands::set_book_metadata,
            commands::save_progress,
            commands::recent_books,
            commands::remove_book,
            commands::take_launch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
