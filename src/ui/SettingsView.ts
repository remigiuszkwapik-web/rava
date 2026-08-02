import { ingestDropboxFiles, type IngestResult } from "../import/ingest";
import {
  beginAuth,
  disconnect,
  fetchNewFiles,
  isConnected,
  setFolder,
} from "../import/dropbox";
import type { Profile } from "../model";
import { getSettings } from "../state/db";
import {
  COACH_MODELS,
  getApiKey,
  getCoachModel,
  setApiKey,
  setCoachModel,
} from "../state/settings";
import { clear, h } from "./dom";

export function settingsView(
  profile: Profile,
  onImported: (r: IngestResult) => void,
): HTMLElement {
  const root = h("div", {});

  (async () => {
    const apiKey = (await getApiKey()) ?? "";
    const model = await getCoachModel();
    const settings = await getSettings();
    const dbx = settings.dropbox ?? {};
    const connected = await isConnected();

    // ---- Coach / API-Key ----
    const keyInput = h("input", {
      type: "password",
      value: apiKey,
      placeholder: "sk-ant-…",
    }) as HTMLInputElement;
    const keyStatus = h("span", { class: "muted" });
    const saveKey = h("button", { class: "ghost" }, "Speichern");
    saveKey.addEventListener("click", async () => {
      await setApiKey(keyInput.value);
      keyStatus.textContent = " gespeichert";
    });

    const modelSel = h(
      "select",
      {},
      ...COACH_MODELS.map((m) => h("option", { value: m, selected: m === model }, m)),
    ) as HTMLSelectElement;
    modelSel.addEventListener("change", () => setCoachModel(modelSel.value));

    root.append(
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Coach (Claude)"),
        h("label", {}, "Anthropic API-Key"),
        keyInput,
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" } }, saveKey, keyStatus),
        h("label", { style: { marginTop: "10px" } }, "Modell"),
        modelSel,
        h(
          "div",
          { class: "muted", style: { marginTop: "8px" } },
          "Der Key wird nur lokal im Browser gespeichert und direkt an Anthropic gesendet. Für die persönliche Nutzung gedacht – teile keine Installation mit fremdem Key.",
        ),
      ),
    );

    // ---- Dropbox ----
    const dbxPanel = h("div", { class: "panel" }, h("h2", {}, "Dropbox-Auto-Import"));
    const dbxStatus = h("div", { class: "muted" });

    const renderDbx = async () => {
      clear(dbxPanel);
      dbxPanel.append(h("h2", {}, "Dropbox-Auto-Import"));
      const nowConnected = await isConnected();
      const cur = (await getSettings()).dropbox ?? {};

      if (!nowConnected) {
        const appKey = h("input", {
          type: "text",
          value: cur.appKey ?? "",
          placeholder: "Dropbox App-Key",
        }) as HTMLInputElement;
        const connect = h("button", { class: "primary" }, "Mit Dropbox verbinden");
        connect.addEventListener("click", () => {
          if (!appKey.value.trim()) {
            dbxStatus.textContent = "Bitte App-Key eintragen.";
            return;
          }
          beginAuth(appKey.value.trim()).catch(
            (e) => (dbxStatus.textContent = (e as Error).message),
          );
        });
        dbxPanel.append(
          h(
            "p",
            { class: "muted" },
            "Wahoo lädt deine .fit-Dateien automatisch in Dropbox. Verbinde Rava mit deiner Dropbox, um neue Fahrten automatisch zu holen. Lege dazu unter dropbox.com/developers eine App an (Scoped, App folder oder Full Dropbox), trage den App-Key ein und ergänze diese Seite als Redirect-URI.",
          ),
          h("label", {}, "App-Key"),
          appKey,
          connect,
        );
      } else {
        const folder = h("input", {
          type: "text",
          value: cur.folder ?? "",
          placeholder: "/Apps/WahooFitness (leer = Root)",
        }) as HTMLInputElement;
        const setF = h("button", { class: "ghost" }, "Ordner setzen");
        setF.addEventListener("click", async () => {
          dbxStatus.textContent = "Setze Ordner …";
          try {
            await setFolder(folder.value);
            dbxStatus.textContent = "Ordner gesetzt. Ab jetzt werden neue Dateien synchronisiert.";
          } catch (e) {
            dbxStatus.textContent = (e as Error).message;
          }
        });
        const sync = h("button", { class: "primary" }, "Jetzt synchronisieren");
        sync.addEventListener("click", async () => {
          dbxStatus.textContent = "Synchronisiere …";
          try {
            const files = await fetchNewFiles();
            if (!files.length) {
              dbxStatus.textContent = "Keine neuen Dateien.";
              return;
            }
            const r = await ingestDropboxFiles(files, profile);
            dbxStatus.textContent = `${r.added} neue Aktivität(en) importiert.`;
            onImported(r);
          } catch (e) {
            dbxStatus.textContent = (e as Error).message;
          }
        });
        const disc = h("button", { class: "ghost" }, "Trennen");
        disc.addEventListener("click", async () => {
          await disconnect();
          await renderDbx();
        });
        dbxPanel.append(
          h("div", { class: "muted" }, "Verbunden ✓" + (cur.lastSync ? ` · letzter Sync ${new Date(cur.lastSync).toLocaleString("de-DE")}` : "")),
          h("label", { style: { marginTop: "10px" } }, "Ordner"),
          folder,
          h("div", { style: { display: "flex", gap: "8px", marginTop: "8px" } }, setF, sync, disc),
        );
      }
      dbxPanel.append(dbxStatus);
    };

    await renderDbx();
    root.append(dbxPanel);
    void connected;
    void dbx;
  })();

  return root;
}
