import "./styles.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import { handleRedirect, fetchNewFiles, isConnected } from "./import/dropbox";
import { ingestDropboxFiles } from "./import/ingest";
import type { Activity, Profile } from "./model";
import {
  deleteActivity,
  deleteProfile,
  getActivities,
  getProfiles,
  putActivity,
} from "./state/db";
import {
  createProfile,
  getActiveProfile,
  setActiveProfile,
  updateProfile,
} from "./state/profile";
import { applyTheme, getTheme } from "./state/settings";
import { compareView } from "./ui/CompareView";
import { clear, h } from "./ui/dom";
import { homeView } from "./ui/HomeView";
import { ridesView } from "./ui/RidesView";
import { onboardingView, profileView } from "./ui/ProfileView";
import { settingsView } from "./ui/SettingsView";

type Tab = "home" | "rides" | "analyze";
type SecondaryView = "profile" | "settings" | null;

const app = document.getElementById("app")!;

let activeProfile: Profile | undefined;
let profiles: Profile[] = [];
let activities: Activity[] = [];
let tab: Tab = "home";
let selectedActivityId: string | undefined;
let secondaryView: SecondaryView = null;
let drawerOpen = false;

async function loadData(): Promise<void> {
  profiles = await getProfiles();
  activeProfile = await getActiveProfile();
  activities = activeProfile ? await getActivities(activeProfile.id) : [];
}

function selectTab(t: Tab): void {
  tab = t;
  secondaryView = null;
  drawerOpen = false;
  render();
}

const HAMBURGER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

function topbar(): HTMLElement {
  const menuBtn = h("button", { class: "menu-btn", title: "Menü", "aria-label": "Menü" });
  menuBtn.innerHTML = HAMBURGER_SVG;
  menuBtn.addEventListener("click", () => {
    drawerOpen = true;
    render();
  });

  const select = h(
    "select",
    { title: "Athlet wählen" },
    ...profiles.map((p) =>
      h("option", { value: p.id, selected: p.id === activeProfile!.id }, p.name),
    ),
  ) as HTMLSelectElement;
  select.addEventListener("change", async () => {
    await setActiveProfile(select.value);
    selectedActivityId = undefined;
    await loadData();
    render();
  });

  return h(
    "div",
    { class: "topbar" },
    menuBtn,
    h("span", { class: "brand" }, "rava"),
    select,
  );
}

function greeting(): HTMLElement {
  const name = (activeProfile!.name || "").trim();
  const first = name.split(/\s+/)[0] || name;
  return h("div", { class: "greeting" }, `Hi ${first}`);
}

function nav(): HTMLElement {
  const tabs: [Tab, string][] = [
    ["home", "Home"],
    ["rides", "Rides"],
    ["analyze", "Analyze"],
  ];
  return h(
    "div",
    { class: "nav" },
    ...tabs.map(([t, label]) => {
      const active = secondaryView === null && t === tab;
      const b = h("button", { class: active ? "active" : "" }, label);
      b.addEventListener("click", () => selectTab(t));
      return b;
    }),
  );
}

function drawer(): HTMLElement {
  const backdrop = h("div", { class: "drawer-backdrop" });
  backdrop.addEventListener("click", () => {
    drawerOpen = false;
    render();
  });

  const close = h("button", { class: "drawer-close", "aria-label": "Schließen" }, "×");
  close.addEventListener("click", () => {
    drawerOpen = false;
    render();
  });

  const item = (label: string, view: Exclude<SecondaryView, null>): HTMLElement => {
    const b = h(
      "button",
      { class: "drawer-item" + (secondaryView === view ? " active" : "") },
      label,
    );
    b.addEventListener("click", () => {
      secondaryView = view;
      drawerOpen = false;
      render();
    });
    return b;
  };

  const panel = h(
    "div",
    { class: "drawer" },
    h(
      "div",
      { class: "drawer-head" },
      h("span", { class: "brand" }, "rava"),
      close,
    ),
    item("Profil", "profile"),
    item("Einstellungen", "settings"),
  );

  return h("div", {}, backdrop, panel);
}

function content(): HTMLElement {
  const p = activeProfile!;

  if (secondaryView === "profile") {
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
        selectedActivityId = undefined;
        await loadData();
        render();
      },
      onDelete: async (id) => {
        await deleteProfile(id);
        await loadData();
        render();
      },
    });
  }
  if (secondaryView === "settings") {
    return settingsView(p, async () => {
      await loadData();
      render();
    });
  }

  switch (tab) {
    case "rides":
      return ridesView(activities, p, selectedActivityId, {
        onDelete: async (a) => {
          await deleteActivity(a.id);
          if (selectedActivityId === a.id) selectedActivityId = undefined;
          await loadData();
          render();
        },
        // Beim Wischen nur die sichtbare Fahrt merken – kein Re-Render,
        // damit die horizontale Scroll-Position erhalten bleibt.
        onView: (a) => {
          selectedActivityId = a.id;
        },
        onRename: async (a, name) => {
          const trimmed = name.trim();
          if (!trimmed || trimmed === a.name) return;
          a.name = trimmed;
          await putActivity(a);
          selectedActivityId = a.id;
          await loadData();
          render();
        },
        onContextChange: async (a, ctx) => {
          a.context = { ...a.context, ...ctx };
          await putActivity(a);
          selectedActivityId = a.id;
          await loadData();
          render();
        },
      });
    case "analyze":
      return compareView(activities, p);
    case "home":
    default:
      return homeView(activities, p, {
        onUploaded: async () => {
          await loadData();
          render();
        },
        onSelect: (a) => {
          selectedActivityId = a.id;
          tab = "rides";
          render();
        },
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
  app.append(topbar(), greeting(), nav(), main);
  if (drawerOpen) app.append(drawer());
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
      render();
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
