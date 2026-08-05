import { ingestFile, type IngestResult } from "../import/ingest";
import type { ContextAnswers, Profile } from "../model";
import { factorChips, TYPE_OPTIONS } from "./contextForm";
import { clear, h } from "./dom";

/**
 * Wiederverwendbares „Add Ride“-Panel: Dropzone + Import-Logik.
 * Wird als Hauptaktion im Home-Reiter eingebettet.
 */
export function addRidePanel(
  profile: Profile,
  onDone: (r: IngestResult) => void,
): HTMLElement {
  const status = h("div", { style: { marginTop: "12px" } });
  const input = h("input", {
    type: "file",
    accept: ".fit,.gpx,.tcx,.gz,.zip",
    style: { display: "none" },
  }) as HTMLInputElement;

  const drop = h(
    "div",
    { class: "drop" },
    h("div", {}, "Datei hierher ziehen oder tippen"),
    h("div", { class: "muted", style: { marginTop: "6px" } }, "FIT · GPX · TCX · .gz · Strava-ZIP"),
  );
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("hover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("hover");
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) handleFile(f);
  });

  function runImport(file: File, context?: ContextAnswers) {
    clear(status);
    const bar = h("progress", { max: "100", value: "0" }) as HTMLProgressElement;
    const label = h("div", { class: "muted" }, "Verarbeite …");
    status.append(label, bar);
    ingestFile(file, profile, {
      context,
      onProgress: (done, total) => {
        bar.max = total;
        bar.value = done;
        label.textContent = `Verarbeite … ${done}/${total}`;
      },
    })
      .then((r) => {
        clear(status);
        status.append(
          h(
            "div",
            {},
            `Fertig: ${r.added} importiert` +
              (r.duplicates ? `, ${r.duplicates} Duplikate übersprungen` : "") +
              (r.failed ? `, ${r.failed} fehlgeschlagen` : "") +
              ".",
          ),
        );
        onDone(r);
      })
      .catch((e) => {
        clear(status);
        status.append(h("div", { class: "error" }, "Fehler: " + (e as Error).message));
      });
  }

  function handleFile(file: File) {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    clear(status);
    if (isZip) {
      status.append(
        h("div", { class: "muted" }, `Strava-Export „${file.name}" wird importiert …`),
      );
      runImport(file);
      return;
    }

    // Kontextfragen für Einzeldatei
    const group = h("select", {}, h("option", { value: "" }, "–"), h("option", { value: "solo" }, "Allein"), h("option", { value: "group" }, "Gruppe")) as HTMLSelectElement;
    const type = h(
      "select",
      {},
      h("option", { value: "" }, "–"),
      ...TYPE_OPTIONS.map(([v, l]) => h("option", { value: v! }, l)),
    ) as HTMLSelectElement;
    const rpe = h("input", { type: "range", min: "1", max: "10", value: "5" }) as HTMLInputElement;
    const rpeOut = h("span", { class: "muted" }, " 5");
    rpe.addEventListener("input", () => (rpeOut.textContent = " " + rpe.value));
    const weather = h("input", { type: "text", placeholder: "z. B. windig, 12 °C" }) as HTMLInputElement;
    const notes = h("input", { type: "text", placeholder: "Freitext für alles, was kein Chip abdeckt" }) as HTMLInputElement;
    const chips = factorChips();

    const btn = h("button", { class: "primary" }, "Analysieren");
    btn.addEventListener("click", () => {
      const factors = chips.read();
      const context: ContextAnswers = {
        group: (group.value || undefined) as ContextAnswers["group"],
        type: (type.value || undefined) as ContextAnswers["type"],
        rpe: Number(rpe.value),
        weather: weather.value.trim() || undefined,
        notes: notes.value.trim() || undefined,
        factors: factors.length ? factors : undefined,
      };
      runImport(file, context);
    });

    status.append(
      h(
        "div",
        { class: "panel" },
        h("h2", {}, `Kontext zu „${file.name}"`),
        h("div", { class: "row" }, h("div", {}, h("label", {}, "Allein / Gruppe"), group), h("div", {}, h("label", {}, "Ziel der Fahrt"), type)),
        h("label", {}, "Anstrengung (RPE)", rpeOut),
        rpe,
        h("label", {}, "Faktoren"),
        chips.el,
        h("div", { class: "row" }, h("div", {}, h("label", {}, "Wetter"), weather), h("div", {}, h("label", {}, "Notiz"), notes)),
        btn,
      ),
    );
  }

  return h(
    "div",
    {},
    h("div", { class: "panel add-ride" }, h("h1", {}, "Add Ride"), drop, input),
    status,
  );
}
