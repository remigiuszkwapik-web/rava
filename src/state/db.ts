import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Activity, Profile, Settings } from "../model";

interface RavaDB extends DBSchema {
  profiles: {
    key: string;
    value: Profile;
  };
  activities: {
    key: string;
    value: Activity;
    indexes: { "by-profile": string; "by-start": number };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const SETTINGS_KEY = "app";

let dbPromise: Promise<IDBPDatabase<RavaDB>> | null = null;

function db(): Promise<IDBPDatabase<RavaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RavaDB>("rava", 1, {
      upgrade(database) {
        database.createObjectStore("profiles", { keyPath: "id" });
        const act = database.createObjectStore("activities", { keyPath: "id" });
        act.createIndex("by-profile", "profileId");
        act.createIndex("by-start", "startTime");
        database.createObjectStore("settings");
      },
    });
  }
  return dbPromise;
}

// ---- Profile ----
export async function getProfiles(): Promise<Profile[]> {
  const all = await (await db()).getAll("profiles");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  return (await db()).get("profiles", id);
}

export async function putProfile(p: Profile): Promise<void> {
  await (await db()).put("profiles", p);
}

export async function deleteProfile(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["profiles", "activities"], "readwrite");
  await tx.objectStore("profiles").delete(id);
  const idx = tx.objectStore("activities").index("by-profile");
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---- Aktivitäten ----
export async function getActivities(profileId: string): Promise<Activity[]> {
  const all = await (await db()).getAllFromIndex(
    "activities",
    "by-profile",
    profileId,
  );
  return all.sort((a, b) => b.startTime - a.startTime); // neueste zuerst
}

export async function getActivity(id: string): Promise<Activity | undefined> {
  return (await db()).get("activities", id);
}

export async function putActivity(a: Activity): Promise<void> {
  await (await db()).put("activities", a);
}

export async function deleteActivity(id: string): Promise<void> {
  await (await db()).delete("activities", id);
}

/** Duplikatprüfung über Profil + Startzeit (±90 s) + ähnliche Dauer. */
export async function findDuplicate(
  profileId: string,
  startTime: number,
  durationS: number,
): Promise<Activity | undefined> {
  const acts = await getActivities(profileId);
  return acts.find(
    (a) =>
      Math.abs(a.startTime - startTime) < 90_000 &&
      Math.abs(a.metrics.durationTotalS - durationS) < 60,
  );
}

// ---- Einstellungen ----
export async function getSettings(): Promise<Settings> {
  const s = await (await db()).get("settings", SETTINGS_KEY);
  return s ?? {};
}

export async function putSettings(s: Settings): Promise<void> {
  await (await db()).put("settings", s, SETTINGS_KEY);
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await putSettings(next);
  return next;
}
