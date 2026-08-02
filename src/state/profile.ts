import type { Profile } from "../model";
import {
  getProfile,
  getProfiles,
  getSettings,
  patchSettings,
  putProfile,
} from "./db";

export function uid(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

/** Default-Vorbelegung des ersten Profils (Rava-Eckdaten – editierbar). */
export function defaultProfileSeed(): Omit<Profile, "id" | "createdAt"> {
  return {
    name: "Ich",
    weightKg: 79,
    ftp: 210,
    maxHr: 190,
    restHr: undefined,
    thresholdHr: undefined,
    age: undefined,
    setupNotes: undefined,
  };
}

export async function createProfile(
  data: Omit<Profile, "id" | "createdAt">,
): Promise<Profile> {
  const p: Profile = { ...data, id: uid(), createdAt: Date.now() };
  await putProfile(p);
  const settings = await getSettings();
  if (!settings.activeProfileId) {
    await patchSettings({ activeProfileId: p.id });
  }
  return p;
}

export async function updateProfile(p: Profile): Promise<void> {
  await putProfile(p);
}

export async function getActiveProfile(): Promise<Profile | undefined> {
  const settings = await getSettings();
  if (settings.activeProfileId) {
    const p = await getProfile(settings.activeProfileId);
    if (p) return p;
  }
  // Fallback: erstes vorhandenes Profil
  const all = await getProfiles();
  if (all.length) {
    await patchSettings({ activeProfileId: all[0].id });
    return all[0];
  }
  return undefined;
}

export async function setActiveProfile(id: string): Promise<void> {
  await patchSettings({ activeProfileId: id });
}
