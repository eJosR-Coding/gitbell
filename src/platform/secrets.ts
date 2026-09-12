// GitHub token lives in the OS keyring, behind three Rust commands. Nothing
// in the webview persists it; `settings.json` on disk never sees it.

import { invoke } from "@tauri-apps/api/core";

export const getToken = () => invoke<string | null>("get_token");
export const setToken = (token: string) => invoke<void>("set_token", { token });
export const deleteToken = () => invoke<void>("delete_token");
