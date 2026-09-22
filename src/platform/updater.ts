// Auto-update. Rust does the download, signature check and install; the
// webview only asks "is there something new?" and shows a banner.

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AvailableUpdate {
  version: string;
  notes: string;
  /** downloads, verifies the signature, installs, then restarts the app */
  install(onProgress: (pct: number | null) => void): Promise<void>;
}

/** Null when up to date, or when the check itself fails (offline, etc.). */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  let update: Update | null;
  try {
    update = await check({ timeout: 15_000 });
  } catch (e) {
    console.warn("update check failed", e);
    return null;
  }
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? "",
    async install(onProgress) {
      let total: number | null = null;
      let done = 0;
      await update!.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? null;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          onProgress(total ? Math.round((done / total) * 100) : null);
        } else if (ev.event === "Finished") onProgress(100);
      });
      await relaunch();
    },
  };
}
