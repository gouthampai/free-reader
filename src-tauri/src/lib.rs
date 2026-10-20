mod annotations;
mod commands;
mod covers;
mod db;
mod epub;
mod error;
mod fulltext;
mod library;
mod menu;
mod opens;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Logs to stdout and a file in the OS log directory; the webview forwards its errors here.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // Restores size, position and maximized state. Not visibility: the window stays hidden
        // until the frontend has rendered.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(opens::PendingOpens::default())
        .menu(menu::build)
        .on_menu_event(menu::handle)
        .setup(|app| {
            // The frontend shows the (initially hidden) window after its first paint. If it fails
            // to load, show the window anyway so the app never looks like it didn't start.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    let _ = window.show();
                });
            }
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("library.db");
            let conn = db::open(&db_path)?;
            let indexer = fulltext::spawn_indexer(db_path);
            app.state::<opens::PendingOpens>()
                .push(opens::from_args(std::env::args()));
            app.manage(AppState {
                db: Mutex::new(conn),
                dirs: library::Dirs {
                    books: dir.join("books"),
                    covers: dir.join("covers"),
                },
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
            commands::take_pending_opens,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Finder double-clicks and "Open With" arrive as an event on macOS, not as arguments.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                opens::enqueue(app, opens::from_urls(&urls));
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            let _ = (app, event);
        });
}
