//! Cover thumbnails stored under `<app data>/covers`, served to the UI via the asset protocol.

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

/// Covers are downscaled to this height: enough for a sharp grid tile on 2x displays.
const MAX_HEIGHT: u32 = 720;

/// Decodes `bytes`, writes a JPEG thumbnail for `book_id` and removes any previous cover.
/// Filenames include a timestamp so the webview never shows a stale cached image.
pub fn store(dir: &Path, book_id: i64, bytes: &[u8]) -> image::ImageResult<PathBuf> {
    let img = image::load_from_memory(bytes)?;
    let img = if img.height() > MAX_HEIGHT {
        img.resize(u32::MAX, MAX_HEIGHT, FilterType::Lanczos3)
    } else {
        img
    };
    fs::create_dir_all(dir)?;
    remove(dir, book_id);
    let path = dir.join(format!("{book_id}-{}.jpg", crate::db::now()));
    let file = BufWriter::new(fs::File::create(&path)?);
    img.to_rgb8()
        .write_with_encoder(JpegEncoder::new_with_quality(file, 85))?;
    Ok(path)
}

/// Deletes every stored cover for `book_id`.
pub fn remove(dir: &Path, book_id: i64) {
    let prefix = format!("{book_id}-");
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};
    use std::io::Cursor;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        RgbImage::new(w, h)
            .write_to(&mut out, ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn stores_downscaled_jpeg_and_replaces_previous() {
        let dir = std::env::temp_dir().join(format!("fr-covers-{}", std::process::id()));
        let first = store(&dir, 7, &png(1000, 1500)).unwrap();
        let img = image::open(&first).unwrap();
        assert_eq!(img.height(), MAX_HEIGHT);
        assert_eq!(img.width(), 480);

        std::thread::sleep(std::time::Duration::from_millis(2));
        let second = store(&dir, 7, &png(10, 20)).unwrap();
        assert!(!first.exists());
        assert_eq!(image::open(&second).unwrap().height(), 20);

        // Covers for other books with a shared prefix-digit are untouched.
        let other = store(&dir, 70, &png(4, 4)).unwrap();
        remove(&dir, 7);
        assert!(!second.exists());
        assert!(other.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_undecodable_images() {
        let dir = std::env::temp_dir().join(format!("fr-covers-bad-{}", std::process::id()));
        assert!(store(&dir, 1, b"not an image").is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
