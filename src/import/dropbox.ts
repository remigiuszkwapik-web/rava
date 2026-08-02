import { getSettings, patchSettings } from "../state/db";

const REDIRECT_URI = () => location.origin + location.pathname;
const ACTIVITY_EXT = /\.(fit|gpx|tcx)(\.gz)?$/i;
const VERIFIER_KEY = "rava-dbx-verifier";
const APPKEY_KEY = "rava-dbx-appkey";

// ---- PKCE-Helfer ----
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomVerifier(): string {
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  return base64url(a);
}
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

// ---- OAuth ----
export async function beginAuth(appKey: string): Promise<void> {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(APPKEY_KEY, appKey);
  const ch = await challenge(verifier);
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", ch);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("redirect_uri", REDIRECT_URI());
  location.assign(url.toString());
}

/** Beim App-Start aufrufen: verarbeitet einen ?code=…-Rücksprung. */
export async function handleRedirect(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const appKey = sessionStorage.getItem(APPKEY_KEY);
  if (!code || !verifier || !appKey) return false;

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      code_verifier: verifier,
      client_id: appKey,
      redirect_uri: REDIRECT_URI(),
    }),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  // URL säubern
  history.replaceState({}, "", REDIRECT_URI());
  if (!res.ok) throw new Error(`Dropbox-Login fehlgeschlagen (${res.status}).`);
  const j = await res.json();
  await patchSettings({
    dropbox: {
      ...(await getSettings()).dropbox,
      appKey,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + (j.expires_in ?? 14400) * 1000,
    },
  });
  return true;
}

export async function isConnected(): Promise<boolean> {
  const d = (await getSettings()).dropbox;
  return !!(d?.refreshToken || d?.accessToken);
}

export async function disconnect(): Promise<void> {
  const cur = (await getSettings()).dropbox;
  await patchSettings({ dropbox: { appKey: cur?.appKey } });
}

async function accessToken(): Promise<string> {
  const s = await getSettings();
  const d = s.dropbox;
  if (!d) throw new Error("Dropbox nicht verbunden.");
  if (d.accessToken && d.expiresAt && d.expiresAt - Date.now() > 60_000) {
    return d.accessToken;
  }
  if (!d.refreshToken || !d.appKey) {
    if (d.accessToken) return d.accessToken;
    throw new Error("Dropbox-Sitzung abgelaufen – bitte neu verbinden.");
  }
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: d.refreshToken,
      client_id: d.appKey,
    }),
  });
  if (!res.ok) throw new Error("Dropbox-Token konnte nicht erneuert werden.");
  const j = await res.json();
  await patchSettings({
    dropbox: {
      ...d,
      accessToken: j.access_token,
      expiresAt: Date.now() + (j.expires_in ?? 14400) * 1000,
    },
  });
  return j.access_token;
}

async function api(path: string, body: unknown): Promise<any> {
  const token = await accessToken();
  const res = await fetch("https://api.dropboxapi.com" + path, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Dropbox ${path} → ${res.status}`);
  return res.json();
}

/** Ordner setzen und Delta-Baseline (Cursor) merken – importiert selbst nichts. */
export async function setFolder(folder: string): Promise<void> {
  const path = folder.trim() === "" ? "" : folder.trim();
  const j = await api("/2/files/list_folder/get_latest_cursor", {
    path,
    recursive: true,
    include_deleted: false,
  });
  const d = (await getSettings()).dropbox;
  await patchSettings({ dropbox: { ...d, folder: path, cursor: j.cursor } });
}

async function download(path: string): Promise<Uint8Array> {
  const token = await accessToken();
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  if (!res.ok) throw new Error(`Dropbox-Download ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface FetchedFile {
  name: string;
  bytes: Uint8Array;
}

/** Neue Aktivitätsdateien seit letztem Sync holen (Cursor-Delta). */
export async function fetchNewFiles(): Promise<FetchedFile[]> {
  const s = await getSettings();
  const d = s.dropbox;
  if (!d) throw new Error("Dropbox nicht verbunden.");
  if (d.cursor === undefined) {
    // Kein Ordner gewählt → nichts zu tun
    return [];
  }
  const out: FetchedFile[] = [];
  let cursor = d.cursor;
  let hasMore = true;
  while (hasMore) {
    const j = await api("/2/files/list_folder/continue", { cursor });
    for (const e of j.entries ?? []) {
      if (e[".tag"] === "file" && ACTIVITY_EXT.test(e.name)) {
        try {
          out.push({ name: e.name, bytes: await download(e.path_lower) });
        } catch {
          /* Datei überspringen */
        }
      }
    }
    cursor = j.cursor;
    hasMore = !!j.has_more;
  }
  await patchSettings({
    dropbox: { ...d, cursor, lastSync: Date.now() },
  });
  return out;
}
