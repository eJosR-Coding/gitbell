//! Custom notification sounds. Instead of letting the webview read arbitrary
//! files through the asset protocol, the user-picked file is copied into
//! `<app data>/sounds/` and only that directory is in the asset scope
//! (see tauri.conf.json). Smaller blast radius if the webview is ever
//! compromised, and the sound keeps working if the original file moves.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const ALLOWED_EXT: [&str; 5] = ["ogg", "wav", "mp3", "flac", "opus"];
const MAX_BYTES: u64 = 5 * 1024 * 1024;

fn sounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(crate::err_str)?.join("sounds");
    std::fs::create_dir_all(&dir).map_err(crate::err_str)?;
    Ok(dir)
}

fn validate(src: &Path) -> Result<String, String> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .ok_or("El archivo no tiene extensión")?;
    if !ALLOWED_EXT.contains(&ext.as_str()) {
        return Err(format!("Formato no soportado: .{ext}"));
    }
    let meta = std::fs::metadata(src).map_err(crate::err_str)?;
    if !meta.is_file() {
        return Err("No es un archivo".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("El archivo pesa más de 5 MB".into());
    }
    Ok(ext)
}

/// Copy `path` into the app's sounds dir. Returns the new absolute path.
#[tauri::command]
pub fn import_sound(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = validate(&src)?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sound")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect::<String>();
    let stem = if stem.is_empty() { "sound".to_string() } else { stem };
    // timestamp suffix so importing the same name twice doesn't clobber
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = sounds_dir(&app)?.join(format!("{stem}-{stamp}.{ext}"));
    std::fs::copy(&src, &dest).map_err(crate::err_str)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::validate;
    use std::path::Path;

    #[test]
    fn rejects_bad_extensions() {
        assert!(validate(Path::new("/tmp/x.exe")).is_err());
        assert!(validate(Path::new("/tmp/noext")).is_err());
    }
}
