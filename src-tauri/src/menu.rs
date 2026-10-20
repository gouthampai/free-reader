//! Native application menu. Custom items are forwarded to the frontend as `menu` events whose
//! payload is the item id (see src/lib/actions.ts); accelerators mirror `shortcutFor` there.

use tauri::menu::{
    AboutMetadata, Menu, MenuEvent, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

const SHOW_LOGS: &str = "show-logs";

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let b = MenuItemBuilder::with_id(id, label);
    match accelerator {
        Some(a) => b.accelerator(a).build(app),
        None => b.build(app),
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata {
        name: Some("Free Reader".into()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };

    let mut file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "add-books", "Add Books…", Some("CmdOrCtrl+O"))?)
        .item(&item(
            app,
            "add-folder",
            "Add Folder…",
            Some("CmdOrCtrl+Shift+O"),
        )?)
        .separator()
        .close_window();
    if cfg!(not(target_os = "macos")) {
        file = file.separator().quit();
    }

    // Predefined items so the system clipboard and undo work in text fields.
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let theme = SubmenuBuilder::new(app, "Theme")
        .item(&item(app, "theme-light", "Light", None)?)
        .item(&item(app, "theme-sepia", "Sepia", None)?)
        .item(&item(app, "theme-dark", "Dark", None)?)
        .item(&item(app, "theme-contrast", "High Contrast", None)?)
        .build()?;

    let mut view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "find", "Find…", Some("CmdOrCtrl+F"))?)
        .separator()
        .item(&item(
            app,
            "text-larger",
            "Larger Text",
            Some("CmdOrCtrl+="),
        )?)
        .item(&item(
            app,
            "text-smaller",
            "Smaller Text",
            Some("CmdOrCtrl+-"),
        )?)
        .item(&theme);
    if cfg!(target_os = "macos") {
        view = view.separator().fullscreen();
    }

    let go = SubmenuBuilder::new(app, "Go")
        .item(&item(app, "go-library", "Library", Some("CmdOrCtrl+L"))?)
        .item(&item(
            app,
            "bookmark",
            "Bookmark Page",
            Some("CmdOrCtrl+D"),
        )?)
        .build()?;

    let mut help =
        SubmenuBuilder::new(app, "Help").item(&item(app, SHOW_LOGS, "Show Log Files", None)?);
    if cfg!(not(target_os = "macos")) {
        // macOS shows About in the app menu; elsewhere it lives under Help.
        help = help
            .separator()
            .item(&PredefinedMenuItem::about(app, None, Some(about.clone()))?);
    }

    let mut menus: Vec<Submenu<R>> = Vec::new();
    if cfg!(target_os = "macos") {
        menus.push(
            SubmenuBuilder::new(app, "Free Reader")
                .about(Some(about))
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?,
        );
    }
    menus.push(file.build()?);
    menus.push(edit);
    menus.push(view.build()?);
    menus.push(go);
    if cfg!(target_os = "macos") {
        menus.push(
            SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .build()?,
        );
    }
    menus.push(help.build()?);

    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = menus
        .iter()
        .map(|m| m as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    Menu::with_items(app, &refs)
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        SHOW_LOGS => match app.path().app_log_dir() {
            Ok(dir) => {
                let _ = std::fs::create_dir_all(&dir);
                if let Err(e) = app.opener().open_path(dir.to_string_lossy(), None::<&str>) {
                    log::warn!("couldn't open log folder: {e}");
                }
            }
            Err(e) => log::warn!("no log folder: {e}"),
        },
        id => {
            let _ = app.emit("menu", id);
        }
    }
}
