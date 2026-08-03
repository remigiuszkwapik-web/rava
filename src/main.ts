import "./styles.css";
import { handleRedirect, fetchNewFiles, isConnected } from "./import/dropbox";
import { ingestDropboxFiles } from "./import/ingest";
import type { Activity, Profile } from "./model";
import { deleteActivity, deleteProfile, getActivities, getProfiles } from "./state/db";
import {
  createProfile,
  getActiveProfile,
  setActiveProfile,
  updateProfile,
} from "./state/profile";
import { applyTheme, getTheme } from "./state/settings";
import { swipeDeck } from "./ui/SwipeDeck";
import { compareView } from "./ui/CompareView";
import { clear, h } from "./ui/dom";
import { onboardingView, profileView } from "./ui/ProfileView";
import { settingsView } from "./ui/SettingsView";
import { uploadView } from "./ui/UploadView";

type Tab = "feed" | "upload" | "compare" | "profile" | "settings";

const app = document.getElementById("app")!;

let activeProfile: Profile | undefined;
let profiles: Profile[] = [];
let activities: Activity[] = [];
let tab: Tab = "feed";

async function loadData(): Promise<void> {
  profiles = await getProfiles();
  activeProfile = await getActiveProfile();
  activities = activeProfile ? await getActivities(activeProfile.id) : [];
}

function topbar(): HTMLElement {
  const select = h(
    "select",
    { title: "Athlet wählen" },
    ...profiles.map((p) =>
      h("option", { value: p.id, selected: p.id === activeProfile!.id }, p.name),
    ),
  ) as HTMLSelectElement;
  select.addEventListener("change", async () => {
    await setActiveProfile(select.value);
    await loadData();
    render();
  });
  return h("div", { class: "topbar" }, h("span", { class: "brand" }, "RAVA"), select);
}

function nav(): HTMLElement {
  const tabs: [Tab, string][] = [
    ["feed", "Feed"],
    ["upload", "Upload"],
    ["compare", "Vergleich"],
    ["profile", "Profil"],
    ["settings", "Einstellungen"],
  ];
  return h(
    "div",
    { class: "nav" },
    ...tabs.map(([t, label]) => {
      const b = h("button", { class: t === tab ? "active" : "" }, label);
      b.addEventListener("click", () => {
        tab = t;
        render();
      });
      return b;
    }),
  );
}

function content(): HTMLElement {
  const p = activeProfile!;
  switch (tab) {
    case "upload":
      return uploadView(p, async () => {
        await loadData();
        tab = "feed";
        render();
      });
    case "compare":
      return compareView(activities, p);
    case "profile":
      return profileView(profiles, p.id, {
        onCreate: async (data) => {
          await createProfile(data);
          await loadData();
          render();
        },
        onUpdate: async (prof) => {
          await updateProfile(prof);
          await loadData();
          render();
        },
        onActivate: async (id) => {
          await setActiveProfile(id);
          await loadData();
          render();
        },
        onDelete: async (id) => {
          await deleteProfile(id);
          await loadData();
          render();
        },
      });
    case "settings":
      return settingsView(p, async () => {
        await loadData();
        tab = "feed";
        render();
      });
    case "feed":
    default:
      return swipeDeck(activities, p, async (a) => {
        await deleteActivity(a.id);
        await loadData();
        render();
      });
  }
}

function render(): void {
  clear(app);
  if (!activeProfile) {
    app.append(
      onboardingView(async (data) => {
        await createProfile(data);
        await loadData();
        render();
      }),
    );
    return;
  }
  const main = h("main", {}, content());
  app.append(topbar(), nav(), main);
}

function registerSW(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* offline optional */
      });
    });
  }
}

async function autoSyncDropbox(): Promise<void> {
  try {
    if (!activeProfile) return;
    if (!(await isConnected())) return;
    const files = await fetchNewFiles();
    if (files.length) {
      await ingestDropboxFiles(files, activeProfile);
      await loadData();
      if (tab === "feed") render();
    }
  } catch {
    /* stiller Fehlschlag – manueller Sync in Einstellungen bleibt möglich */
  }
}

(async () => {
  registerSW();
  try {
    await handleRedirect();
  } catch (e) {
    console.warn("Dropbox-Redirect:", e);
  }
  applyTheme(await getTheme());
  await loadData();
  render();
  void autoSyncDropbox();
})();
