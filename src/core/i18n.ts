// Tiny i18n. No library: two dictionaries, a `t()` with {placeholders}, and
// language detection from the browser locale (which in the webview is the
// OS locale). Keys are grouped by screen so a translator can scan them.

export type Lang = "es" | "en";
export type LangSetting = "auto" | Lang;

export const LANGS: Lang[] = ["es", "en"];

const dict = {
  es: {
    // header
    "status.idle": "En espera",
    "status.polling": "Revisando…",
    "status.ok": "Última revisión {time}",
    "status.remaining": " · {n} req restantes",
    "status.paused": "{reason}, reintento a las {time}",
    "status.error": "Error: {message}",
    "header.pollNow": "Revisar ahora",
    // account
    "account.title": "Cuenta",
    "account.hint": "Token personal de GitHub con scope <code>repo</code> (para repos privados) y <code>read:org</code>. Se guarda en el llavero de tu sistema.",
    "account.save": "Guardar y verificar",
    "account.pasteFirst": "Pega un token primero",
    "account.verifying": "Verificando…",
    "account.connected": "Conectado como @{login}",
    "account.invalid": "Token inválido: {error}",
    "account.stored": "•••••••• (guardado en el llavero del sistema)",
    // targets
    "targets.title": "Qué vigilar",
    "targets.hint": "<code>owner/repo</code> para un repo, <code>org:nombre</code> para toda una organización, <code>@me</code> para todo lo que sigues o tienes en watch.",
    "targets.add": "Agregar",
    "targets.invalid": "Usa owner/repo, org:nombre o @me",
    "targets.remove": "Quitar {target}",
    // events
    "events.title": "Qué avisar",
    "cat.push": "Pushes",
    "cat.pr": "Pull requests",
    "cat.review": "Reviews de PR",
    "cat.issue": "Issues",
    "cat.comment": "Comentarios",
    "cat.branch": "Ramas y tags",
    "cat.release": "Releases",
    "cat.social": "Stars, forks, miembros",
    "cat.external": "Avisos externos (gitbell notify)",
    // sounds
    "sounds.title": "Sonidos",
    "sounds.enabled": "Reproducir sonido con cada aviso",
    "sounds.volume": "Volumen",
    "sounds.none": "Sin sonido",
    "sounds.builtin": "Sonido {n}",
    "sounds.file": "Archivo: {name}",
    "sounds.pick": "Archivo propio…",
    "sounds.pickTitle": "Sonido para {category}",
    "sounds.play": "Escuchar",
    "sounds.importFailed": "No se pudo importar el sonido: {error}",
    // options
    "options.title": "Opciones",
    "options.interval": "Revisar cada",
    "options.seconds": "s",
    "options.ignoreOwn": "Ignorar lo que hago yo",
    "options.autostart": "Iniciar con el sistema",
    "options.language": "Idioma",
    "lang.auto": "Automático",
    "lang.es": "Español",
    "lang.en": "English",
    "options.test": "Probar notificación",
    "test.title": "GitBell funciona",
    "test.body": "Así se van a ver los avisos. Click para abrir GitHub.",
    // recent
    "recent.title": "Actividad reciente",
    "recent.empty": "Todavía nada. Cuando alguien haga algo, aparece aquí.",
    // poller
    "poller.noToken": "Falta el token de GitHub",
    "poller.rateLimit": "Rate limit de GitHub",
    "poller.more": "…y {n} evento más. Abre la app para verlos.",
    "poller.morePlural": "…y {n} eventos más. Abre la app para verlos.",
    // event phrases
    "ev.push.title": "{who} hizo push a {repo}",
    "ev.push.body": "{n} commit en {branch}",
    "ev.push.bodyPlural": "{n} commits en {branch}",
    "ev.pr.opened": "{who} abrió PR #{num} en {repo}",
    "ev.pr.merged": "{who} mergeó PR #{num} en {repo}",
    "ev.pr.closed": "{who} cerró PR #{num} en {repo}",
    "ev.pr.reopened": "{who} reabrió PR #{num} en {repo}",
    "ev.pr.ready": "{who} marcó listo para review PR #{num} en {repo}",
    "ev.pr.other": "{who} {action} PR #{num} en {repo}",
    "ev.review.approved": "{who} aprobó PR #{num} en {repo}",
    "ev.review.changes": "{who} pidió cambios en PR #{num} en {repo}",
    "ev.review.commented": "{who} comentó en PR #{num} en {repo}",
    "ev.reviewComment": "{who} comentó código en PR #{num} de {repo}",
    "ev.issue.opened": "{who} abrió issue #{num} en {repo}",
    "ev.issue.closed": "{who} cerró issue #{num} en {repo}",
    "ev.issue.other": "{who} {action} issue #{num} en {repo}",
    "ev.comment.pr": "{who} comentó en PR #{num} de {repo}",
    "ev.comment.issue": "{who} comentó en issue #{num} de {repo}",
    "ev.commitComment": "{who} comentó un commit en {repo}",
    "ev.create.repo": "{who} creó el repo {repo}",
    "ev.create.branch": "{who} creó la rama {ref} en {repo}",
    "ev.create.tag": "{who} creó el tag {ref} en {repo}",
    "ev.delete.branch": "{who} borró la rama {ref} en {repo}",
    "ev.delete.tag": "{who} borró el tag {ref} en {repo}",
    "ev.release": "{who} publicó release {tag} en {repo}",
    "ev.star": "{who} le dio star a {repo}",
    "ev.fork": "{who} forkeó {repo}",
    "ev.member": "{who} agregó a {member} en {repo}",
  },
  en: {
    "status.idle": "Idle",
    "status.polling": "Checking…",
    "status.ok": "Last check {time}",
    "status.remaining": " · {n} req left",
    "status.paused": "{reason}, retrying at {time}",
    "status.error": "Error: {message}",
    "header.pollNow": "Check now",
    "account.title": "Account",
    "account.hint": "GitHub personal access token with the <code>repo</code> scope (private repos) and <code>read:org</code>. Stored in your system keyring.",
    "account.save": "Save and verify",
    "account.pasteFirst": "Paste a token first",
    "account.verifying": "Verifying…",
    "account.connected": "Connected as @{login}",
    "account.invalid": "Invalid token: {error}",
    "account.stored": "•••••••• (stored in the system keyring)",
    "targets.title": "What to watch",
    "targets.hint": "<code>owner/repo</code> for one repo, <code>org:name</code> for a whole organization, <code>@me</code> for everything you watch or follow.",
    "targets.add": "Add",
    "targets.invalid": "Use owner/repo, org:name or @me",
    "targets.remove": "Remove {target}",
    "events.title": "What to notify",
    "cat.push": "Pushes",
    "cat.pr": "Pull requests",
    "cat.review": "PR reviews",
    "cat.issue": "Issues",
    "cat.comment": "Comments",
    "cat.branch": "Branches and tags",
    "cat.release": "Releases",
    "cat.social": "Stars, forks, members",
    "cat.external": "External notices (gitbell notify)",
    "sounds.title": "Sounds",
    "sounds.enabled": "Play a sound with every notification",
    "sounds.volume": "Volume",
    "sounds.none": "No sound",
    "sounds.builtin": "Sound {n}",
    "sounds.file": "File: {name}",
    "sounds.pick": "Custom file…",
    "sounds.pickTitle": "Sound for {category}",
    "sounds.play": "Play",
    "sounds.importFailed": "Couldn't import the sound: {error}",
    "options.title": "Options",
    "options.interval": "Check every",
    "options.seconds": "s",
    "options.ignoreOwn": "Ignore my own activity",
    "options.autostart": "Start with the system",
    "options.language": "Language",
    "lang.auto": "Automatic",
    "lang.es": "Español",
    "lang.en": "English",
    "options.test": "Test notification",
    "test.title": "GitBell works",
    "test.body": "This is what notifications look like. Click to open GitHub.",
    "recent.title": "Recent activity",
    "recent.empty": "Nothing yet. When someone does something, it shows up here.",
    "poller.noToken": "GitHub token missing",
    "poller.rateLimit": "GitHub rate limit",
    "poller.more": "…and {n} more event. Open the app to see it.",
    "poller.morePlural": "…and {n} more events. Open the app to see them.",
    "ev.push.title": "{who} pushed to {repo}",
    "ev.push.body": "{n} commit on {branch}",
    "ev.push.bodyPlural": "{n} commits on {branch}",
    "ev.pr.opened": "{who} opened PR #{num} in {repo}",
    "ev.pr.merged": "{who} merged PR #{num} in {repo}",
    "ev.pr.closed": "{who} closed PR #{num} in {repo}",
    "ev.pr.reopened": "{who} reopened PR #{num} in {repo}",
    "ev.pr.ready": "{who} marked PR #{num} ready for review in {repo}",
    "ev.pr.other": "{who} {action} PR #{num} in {repo}",
    "ev.review.approved": "{who} approved PR #{num} in {repo}",
    "ev.review.changes": "{who} requested changes on PR #{num} in {repo}",
    "ev.review.commented": "{who} reviewed PR #{num} in {repo}",
    "ev.reviewComment": "{who} commented on code in PR #{num} of {repo}",
    "ev.issue.opened": "{who} opened issue #{num} in {repo}",
    "ev.issue.closed": "{who} closed issue #{num} in {repo}",
    "ev.issue.other": "{who} {action} issue #{num} in {repo}",
    "ev.comment.pr": "{who} commented on PR #{num} of {repo}",
    "ev.comment.issue": "{who} commented on issue #{num} of {repo}",
    "ev.commitComment": "{who} commented on a commit in {repo}",
    "ev.create.repo": "{who} created the repo {repo}",
    "ev.create.branch": "{who} created branch {ref} in {repo}",
    "ev.create.tag": "{who} created tag {ref} in {repo}",
    "ev.delete.branch": "{who} deleted branch {ref} in {repo}",
    "ev.delete.tag": "{who} deleted tag {ref} in {repo}",
    "ev.release": "{who} published release {tag} in {repo}",
    "ev.star": "{who} starred {repo}",
    "ev.fork": "{who} forked {repo}",
    "ev.member": "{who} added {member} to {repo}",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type Key = keyof (typeof dict)["es"];

/** Test-only: lets the completeness test compare languages. */
export const __dict = dict;

let current: Lang = "es";

export function getLang(): Lang {
  return current;
}

/** Map a BCP-47 tag ("es-PE", "en_US") to a supported language. */
export function detectLang(tag: string | undefined): Lang {
  return (tag ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

/** Resolve the user setting against the system locale and activate it. */
export function initLang(setting: LangSetting, systemTag: string | undefined): Lang {
  current = setting === "auto" ? detectLang(systemTag) : setting;
  return current;
}

export function t(key: Key, params: Record<string, string | number> = {}): string {
  let s: string = dict[current][key] ?? dict.es[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Fill every element with data-i18n / data-i18n-html from the dictionary. */
export function applyStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
  // only for keys that contain <code> markup we wrote ourselves
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as Key);
  });
  document.documentElement.lang = current;
}
