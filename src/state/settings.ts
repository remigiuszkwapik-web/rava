import { getSettings, patchSettings } from "./db";

export const DEFAULT_COACH_MODEL = "claude-sonnet-5";
export const COACH_MODELS = ["claude-sonnet-5", "claude-opus-5"];

export async function getApiKey(): Promise<string | undefined> {
  return (await getSettings()).anthropicApiKey;
}

export async function setApiKey(key: string | undefined): Promise<void> {
  await patchSettings({ anthropicApiKey: key?.trim() || undefined });
}

export async function getCoachModel(): Promise<string> {
  return (await getSettings()).coachModel || DEFAULT_COACH_MODEL;
}

export async function setCoachModel(model: string): Promise<void> {
  await patchSettings({ coachModel: model });
}

// ---- Darstellung (Hell/Dunkel) ----
export type Theme = "dark" | "light";
export const DEFAULT_THEME: Theme = "light";
const THEME_KEY = "rava-theme";
const THEME_META: Record<Theme, string> = {
  dark: "#0f0f0f",
  light: "#f1f1f0",
};

export async function getTheme(): Promise<Theme> {
  return (await getSettings()).theme ?? DEFAULT_THEME;
}

export async function setTheme(theme: Theme): Promise<void> {
  await patchSettings({ theme });
  applyTheme(theme);
}

/** Theme sofort auf das Dokument anwenden (CSS-Tokens + Statusleiste). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* privater Modus o. Ä. – Theme wird dann nur aus IndexedDB geladen */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_META[theme]);
}
