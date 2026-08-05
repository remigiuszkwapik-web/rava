// Gemeinsame Kontext-Bausteine für Upload-Panel und Fahrt-Detailkarte:
// Optionen (Allein/Gruppe, Ziel der Fahrt), anklickbare Faktor-Chips und ein
// editierbares Kontext-Panel. Eine Quelle, damit beide Stellen identisch sind.

import type { ContextAnswers } from "../model";
import { h } from "./dom";

export const GROUP_OPTIONS: [NonNullable<ContextAnswers["group"]>, string][] = [
  ["solo", "Allein"],
  ["group", "Gruppe"],
];

export const TYPE_OPTIONS: [NonNullable<ContextAnswers["type"]>, string][] = [
  ["endurance", "Grundlage"],
  ["intervals", "Intervalle"],
  ["race", "Rennen"],
  ["recovery", "Rekom"],
  ["climb", "Berg"],
  ["commute", "Pendeln"],
  ["other", "Sonstiges"],
];

/** Ein anklickbarer Kontext-Faktor. `hint` wird im Feedback zur Einordnung genutzt. */
export interface RideFactor {
  key: string;
  label: string;
  group: string;
}

/**
 * Katalog schnell anklickbarer Faktoren – ersetzt für die häufigen Fälle das
 * Tippen einer Notiz. Reihenfolge = Anzeigereihenfolge; nach `group` gruppiert.
 * Keys sind stabil (werden persistiert), Labels dürfen sich ändern.
 */
export const FACTORS: RideFactor[] = [
  // Wind
  { key: "wind-tail", label: "Rückenwind", group: "Wind" },
  { key: "wind-head", label: "Gegenwind", group: "Wind" },
  { key: "wind-mixed", label: "Wechselnder Wind", group: "Wind" },
  // Gruppe / Windschatten
  { key: "joined-group", label: "Unterwegs Gruppe angeschlossen", group: "Gruppe & Windschatten" },
  { key: "much-draft", label: "Viel Windschatten", group: "Gruppe & Windschatten" },
  { key: "lead-work", label: "Viel Führungsarbeit", group: "Gruppe & Windschatten" },
  // Verlauf
  { key: "fade-2nd", label: "Einbruch 2. Hälfte", group: "Verlauf" },
  { key: "cramp", label: "Krämpfe", group: "Verlauf" },
  { key: "bonk", label: "Leer gefahren / Hungerast", group: "Verlauf" },
  { key: "strong-finish", label: "Stark bis zum Schluss", group: "Verlauf" },
  // Zustand vorher
  { key: "tired-start", label: "Müde/vorbelastet gestartet", group: "Zustand vorher" },
  { key: "fresh-start", label: "Frisch/erholt gestartet", group: "Zustand vorher" },
  { key: "sick", label: "Angeschlagen/krank", group: "Zustand vorher" },
  // Umgebung
  { key: "heat", label: "Hitze", group: "Umgebung" },
  { key: "cold", label: "Kälte", group: "Umgebung" },
  { key: "wet", label: "Regen/nass", group: "Umgebung" },
  // Unterbrechungen
  { key: "mechanical", label: "Defekt/Panne", group: "Unterbrechungen" },
  { key: "long-stops", label: "Viele Stopps/Ampeln", group: "Unterbrechungen" },
  { key: "long-break", label: "Längere Pause", group: "Unterbrechungen" },
  // Ausführung
  { key: "intervals-done", label: "Intervalle wie geplant", group: "Ausführung" },
  { key: "intervals-aborted", label: "Intervalle abgebrochen", group: "Ausführung" },
];

const FACTOR_BY_KEY = new Map(FACTORS.map((f) => [f.key, f]));

export function factorLabel(key: string): string {
  return FACTOR_BY_KEY.get(key)?.label ?? key;
}

export function groupLabel(g?: ContextAnswers["group"]): string | undefined {
  return GROUP_OPTIONS.find(([v]) => v === g)?.[1];
}

export function typeLabel(t?: ContextAnswers["type"]): string | undefined {
  return TYPE_OPTIONS.find(([v]) => v === t)?.[1];
}

/** Distinct-Gruppen in Katalogreihenfolge. */
function factorGroups(): string[] {
  const seen: string[] = [];
  for (const f of FACTORS) if (!seen.includes(f.group)) seen.push(f.group);
  return seen;
}

/**
 * Gruppierte, umschaltbare Faktor-Chips. `read()` liefert die gewählten Keys in
 * Katalogreihenfolge. Wird im Upload-Panel und im Kontext-Editor verwendet.
 */
export function factorChips(selected: Iterable<string> = []): {
  el: HTMLElement;
  read: () => string[];
} {
  const state = new Set(selected);
  const wrap = h("div", { class: "factor-groups" });

  for (const group of factorGroups()) {
    const chips = h("div", { class: "chips" });
    for (const f of FACTORS.filter((x) => x.group === group)) {
      const chip = h(
        "button",
        { type: "button", class: "chip" + (state.has(f.key) ? " selected" : "") },
        f.label,
      );
      chip.setAttribute("aria-pressed", state.has(f.key) ? "true" : "false");
      chip.addEventListener("click", () => {
        if (state.has(f.key)) state.delete(f.key);
        else state.add(f.key);
        const on = state.has(f.key);
        chip.classList.toggle("selected", on);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
      });
      chips.append(chip);
    }
    wrap.append(h("div", { class: "factor-group" }, h("div", { class: "factor-group-label" }, group), chips));
  }

  return { el: wrap, read: () => FACTORS.map((f) => f.key).filter((k) => state.has(k)) };
}

/** Statische Chip-Reihe (nur Anzeige, keine Interaktion). */
function chipRow(labels: string[], cls = "chips"): HTMLElement {
  return h("div", { class: cls }, ...labels.map((l) => h("span", { class: "chip static" }, l)));
}

/**
 * Editierbares Kontext-Panel: zeigt Gruppe, Ziel, Wetter, Faktoren und Notiz an
 * und lässt sie per „✎“ bearbeiten (analog zum bearbeitbaren Namen). Speichern
 * ruft `onSave` mit dem zusammengeführten Kontext (rpe bleibt erhalten).
 */
export function contextEditor(
  current: ContextAnswers | undefined,
  onSave: (ctx: ContextAnswers) => void,
): HTMLElement {
  const wrap = h("div", { class: "context-block" });
  const ctx: ContextAnswers = { ...(current ?? {}) };

  function showDisplay() {
    const rows: HTMLElement[] = [];
    const line = (label: string, value: Node | string) =>
      h("div", { class: "context-item" }, h("span", { class: "context-label" }, label), value instanceof Node ? value : h("span", {}, value));

    const g = groupLabel(ctx.group);
    if (g) rows.push(line("Fahrt", chipRow([g])));
    const t = typeLabel(ctx.type);
    if (t) rows.push(line("Ziel", chipRow([t])));
    if (ctx.weather) rows.push(line("Wetter", ctx.weather));
    if (ctx.factors?.length)
      rows.push(line("Faktoren", chipRow(ctx.factors.map(factorLabel))));
    if (ctx.notes) rows.push(line("Notiz", ctx.notes));

    const edit = h("button", {
      class: "ctx-edit",
      type: "button",
      title: "Kontext bearbeiten",
      "aria-label": "Kontext bearbeiten",
    });
    edit.textContent = "✎";
    edit.addEventListener("click", beginEdit);

    const headRow = h(
      "div",
      { class: "context-head" },
      h("span", { class: "context-title" }, "Kontext"),
      edit,
    );

    wrap.replaceChildren(
      headRow,
      rows.length
        ? h("div", {}, ...rows)
        : h("div", { class: "muted" }, "Keine Angaben – ✎ zum Ergänzen (Gruppe, Ziel, Faktoren …)."),
    );
  }

  function beginEdit() {
    const group = h(
      "select",
      {},
      h("option", { value: "" }, "–"),
      ...GROUP_OPTIONS.map(([v, l]) => h("option", { value: v, selected: ctx.group === v }, l)),
    ) as HTMLSelectElement;
    const type = h(
      "select",
      {},
      h("option", { value: "" }, "–"),
      ...TYPE_OPTIONS.map(([v, l]) => h("option", { value: v, selected: ctx.type === v }, l)),
    ) as HTMLSelectElement;
    const weather = h("input", { type: "text", value: ctx.weather ?? "", placeholder: "z. B. windig, 12 °C" }) as HTMLInputElement;
    const chips = factorChips(ctx.factors ?? []);
    const notes = h("textarea", { rows: "2", placeholder: "Freitext für alles, was kein Chip abdeckt" }) as HTMLTextAreaElement;
    notes.value = ctx.notes ?? "";

    const save = h("button", { class: "primary", type: "button" }, "Speichern");
    const cancel = h("button", { class: "ghost", type: "button", style: { marginTop: "8px", width: "100%" } }, "Abbrechen");
    cancel.addEventListener("click", showDisplay);
    save.addEventListener("click", () => {
      ctx.group = (group.value || undefined) as ContextAnswers["group"];
      ctx.type = (type.value || undefined) as ContextAnswers["type"];
      ctx.weather = weather.value.trim() || undefined;
      ctx.notes = notes.value.trim() || undefined;
      const f = chips.read();
      ctx.factors = f.length ? f : undefined;
      onSave({ ...ctx });
      showDisplay();
    });

    wrap.replaceChildren(
      h("span", { class: "context-title" }, "Kontext bearbeiten"),
      h("div", { class: "row" }, h("div", {}, h("label", {}, "Allein / Gruppe"), group), h("div", {}, h("label", {}, "Ziel der Fahrt"), type)),
      h("label", {}, "Wetter"),
      weather,
      h("label", {}, "Faktoren"),
      chips.el,
      h("label", {}, "Notiz"),
      notes,
      save,
      cancel,
    );
  }

  showDisplay();
  return wrap;
}
