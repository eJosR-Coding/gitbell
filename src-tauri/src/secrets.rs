//! GitHub token storage. Goes to the OS keyring (Secret Service / KWallet on
//! Linux, Credential Manager on Windows, Keychain on macOS) instead of a
//! plaintext JSON next to the settings. The webview only ever sees the
//! token through these commands.

use keyring::Entry;

const SERVICE: &str = "dev.ejos.gitbell";
const ACCOUNT: &str = "github-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(crate::err_str)
}

#[tauri::command]
pub fn get_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_token(token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return delete_token();
    }
    entry()?.set_password(token).map_err(crate::err_str)
}

#[tauri::command]
pub fn delete_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use keyring::Entry;

    /// Talks to the real OS keyring, so it's opt-in:
    /// `cargo test -- --ignored keyring_roundtrip`
    #[test]
    #[ignore]
    fn keyring_roundtrip() {
        let e = Entry::new(super::SERVICE, "test-roundtrip").unwrap();
        e.set_password("s3cret").unwrap();
        assert_eq!(e.get_password().unwrap(), "s3cret");
        e.delete_credential().unwrap();
        assert!(matches!(e.get_password(), Err(keyring::Error::NoEntry)));
    }
}
