import {
  effortsOf,
  EFFORT_WINDOWS,
  milestonesFor,
  windowLabel,
  type Milestone,
} from "../analysis/bestEfforts";
import { buildFeedback } from "../analysis/feedback";
import { hrZoneModel, powerZoneModel } from "../analysis/metrics";
import {
  fmtDate,
  fmtDuration,
  fmtKm,
  fmtKmh,
  n0,
  n1,
  n2,
} from "../format";
import { coachComment } from "../llm/coach";
import type { Activity, ContextAnswers, Profile } from "../model";
import { getApiKey, getCoachModel } from "../state/settings";
import { drawRoute, drawTimeline, drawZones } from "./charts";
import { contextEditor, groupLabel, typeLabel } from "./contextForm";
import { clear, h } from "./dom";

/** Kurzerklärungen zu Fachbegriffen (Info-Icon in den Kennzahlen). */
const GLOSSARY: Record<string, string> = {
  np: "Normalized Power (NP): gewichtete Durchschnittsleistung, die kurze harte Abschnitte stärker berücksichtigt als der reine Mittelwert – näher am tatsächlich empfundenen Aufwand.",
  if: "Intensity Factor (IF): NP im Verhältnis zur FTP. 1,0 = eine Stunde am Limit, ~0,7 lockere Grundlage.",
  tss: "Training Stress Score (TSS): Gesamtbelastung aus Dauer und Intensität. 100 entspricht etwa einer harten Stunde an der Schwelle (FTP).",
  vi: "Variabilität (VI): NP geteilt durch die Durchschnittsleistung. Nahe 1,0 = sehr gleichmäßig getreten, höher = viele Antritte und Pausen.",
  wkg: "W/kg: Leistung pro Kilogramm Körpergewicht (auf Basis der NP) – macht die Leistung unabhängig vom Gewicht vergleichbar.",
  aerob: "Aerober Anteil: Zeit in den unteren Puls-Zonen (Z1–Z2), also im gut aeroben Grundlagenbereich. Ein hoher Wert steht für eine ruhige Grundlagenfahrt (Fettstoffwechsel, Regeneration, Ausdauerbasis), ein niedriger für viel Tempo-/Schwellenarbeit. Kein Wert ist per se besser – er zeigt, ob die Fahrt zum Ziel der Einheit gepasst hat: hoch bei Grundlage/Recovery, niedrig bei Intervall-/Tempoeinheiten. Der Wert ergänzt die Gesamtintensität, denn Dauer und einzelne harte Spitzen können sie hochtreiben, obwohl der Puls überwiegend niedrig blieb.",
  decoupling: "Aerobes Decoupling (Leistung:Puls): Drift von Leistung zu Puls von der 1. zur 2. Hälfte. Unter ~5 % = gute aerobe Ausdauer; höher deutet auf Ermüdung, dünne Grundlage oder Hitze hin. Sinnvoll nur bei gleichmäßigen Solo-Fahrten – bei Gruppenfahrten verfälscht der Windschatten Leistung/Puls, daher wird Decoupling dort nicht angezeigt.",
};

function effortBadge(intensity: number): HTMLElement {
  const color =
    intensity <= 3
      ? "var(--z2)"
      : intensity <= 5
        ? "var(--z3)"
        : intensity <= 7
          ? "var(--power)"
          : intensity <= 8
            ? "var(--z6)"
            : "var(--hr)";
  const badge = h("span", { class: "effort-badge" }, `Intensität ${intensity}/10`);
  badge.style.background = color;
  return badge;
}

function heroStats(items: Array<[string, string, string?]>): HTMLElement {
  return h(
    "div",
    { class: "hero-stats" },
    ...items.map(([label, value, unit]) =>
      h(
        "div",
        { class: "hstat" },
        h(
          "div",
          { class: "v" },
          value,
          unit ? h("span", { class: "u" }, unit) : null,
        ),
        h("div", { class: "l" }, label),
      ),
    ),
  );
}

/** [Bezeichnung, Wert, optional: Glossar-Schlüssel für das Info-Icon]. */
type StatRow = [string, string, string?];

/** Zeile nur behalten, wenn ein echter Wert vorliegt. */
function row(k: string, v: string, info?: string): StatRow | null {
  return v === "–" || v === "" ? null : [k, v, info];
}

/** Kleines Info-Icon, das eine Kurzerklärung ein-/ausblendet. */
function infoIcon(term: string, tip: HTMLElement): HTMLButtonElement {
  const btn = h("button", {
    class: "info-btn",
    type: "button",
    title: "Erklärung",
    "aria-label": `Erklärung zu ${term}`,
  }) as HTMLButtonElement;
  btn.textContent = "i";
  btn.addEventListener("click", () => {
    const show = tip.hidden;
    tip.hidden = !show;
    btn.classList.toggle("on", show);
  });
  return btn;
}

function statList(
  rows: Array<StatRow | null>,
  accent = "",
): HTMLElement | null {
  const r = rows.filter((x): x is StatRow => x !== null);
  if (!r.length) return null;
  const list = h("div", { class: ("stat-list " + accent).trim() });
  for (const [k, v, info] of r) {
    const key = h("span", { class: "k" }, k);
    let tip: HTMLElement | null = null;
    if (info && GLOSSARY[info]) {
      tip = h("div", { class: "info-text" }, GLOSSARY[info]);
      tip.hidden = true;
      key.append(infoIcon(k, tip));
    }
    list.append(
      h("div", { class: "stat-row" }, key, h("span", { class: "v" }, v)),
    );
    if (tip) list.append(tip);
  }
  return list;
}

/** „beste" / „zweithöchste" / „dritthöchste" für den Badge-Text. */
function rankWord(rank: number): string {
  return rank === 1 ? "beste" : rank === 2 ? "zweithöchste" : "dritthöchste";
}

/** Eine Medaille + Text wie im Strava-Screenshot. */
function milestoneBadge(m: Milestone): HTMLElement {
  const noun = m.kind === "power" ? "Leistung" : "Tempo";
  const article = m.kind === "power" ? "Deine" : "Dein";
  const val = m.kind === "power" ? n0(m.value) + " W" : fmtKmh(m.value);
  const medal = h("div", { class: `medal medal-${m.rank}` }, String(m.rank));
  const lines = [
    h(
      "div",
      { class: "milestone-title" },
      `${article} ${rankWord(m.rank)} ${noun} über ${windowLabel(m.window, true)}!`,
    ),
    h("div", { class: "milestone-sub" }, val),
  ];
  if (m.seasonBest)
    lines.push(
      h(
        "div",
        { class: "milestone-season" },
        `Saison-Bestleistung ${new Date().getFullYear()}`,
      ),
    );
  return h("div", { class: "milestone" }, medal, h("div", {}, ...lines));
}

/** Meilenstein-Badges (nur Top-3-Fenster), sonst null. */
function milestoneBadges(a: Activity, all: Activity[]): HTMLElement | null {
  const ms = milestonesFor(a, all);
  if (!ms.length) return null;
  return h("div", { class: "milestones" }, ...ms.map(milestoneBadge));
}

/** Kompakte Bestwert-Tabelle über alle Zeitfenster. */
function bestEffortTable(a: Activity): HTMLElement | null {
  const eff = effortsOf(a);
  const rows = EFFORT_WINDOWS.map((w) => {
    const v = eff.best[w];
    if (v === undefined) return null;
    const val = eff.kind === "power" ? n0(v) + " W" : fmtKmh(v);
    return row(windowLabel(w), val);
  });
  return statList(rows, eff.kind === "power" ? "power" : "");
}

function feedbackBlock(a: Activity, prev?: Activity): HTMLElement {
  const fb = buildFeedback(a, prev);
  const section = (title: string, lines: string[]) =>
    lines.length
      ? [h("h3", {}, title), ...lines.map((l) => h("p", {}, l))]
      : [];
  return h(
    "div",
    { class: "feedback" },
    h("h3", {}, "Fazit"),
    h("p", {}, fb.fazit),
    ...section("Analyse", fb.analyse),
    ...section("Was heraussticht", fb.heraus),
    ...section("Vergleich", fb.vergleich),
    ...section("Empfehlung", fb.empfehlung),
  );
}

function coachBlock(a: Activity, profile: Profile, prev?: Activity): HTMLElement {
  const out = h("div", { style: { marginTop: "10px" } });
  const btn = h(
    "button",
    { class: "ghost", style: { width: "100%" } },
    "🤖 Coach-Kommentar (Claude)",
  );
  btn.addEventListener("click", async () => {
    const apiKey = await getApiKey();
    if (!apiKey) {
      clear(out);
      out.append(
        h(
          "div",
          { class: "muted" },
          "Kein API-Key hinterlegt. Unter „Einstellungen“ einen Anthropic-API-Key eintragen, um den Coach-Kommentar zu nutzen.",
        ),
      );
      return;
    }
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Coach denkt nach…";
    clear(out);
    try {
      const model = await getCoachModel();
      const text = await coachComment(a, profile, prev, { apiKey, model });
      clear(out);
      const panel = h("div", {
        class: "feedback",
        style: { whiteSpace: "pre-wrap", marginTop: "10px" },
      });
      panel.textContent = text;
      out.append(panel);
    } catch (e) {
      clear(out);
      out.append(
        h("div", { class: "error" }, "Fehler: " + (e as Error).message),
      );
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });
  return h("div", {}, btn, out);
}

/**
 * Bearbeitbarer Fahrtname: zeigt den Namen mit Stift-Button; ein Klick macht
 * daraus ein Eingabefeld (Enter/Blur speichert, Esc bricht ab).
 */
function editableTitle(
  name: string,
  onRename: (name: string) => void,
): HTMLElement {
  const wrap = h("div", { class: "hero-title-row" });

  const showDisplay = () => {
    const title = h("div", { class: "hero-title" }, name);
    const edit = h("button", {
      class: "title-edit",
      type: "button",
      title: "Umbenennen",
      "aria-label": "Namen bearbeiten",
    });
    edit.textContent = "✎";
    edit.addEventListener("click", beginEdit);
    wrap.replaceChildren(title, edit);
  };

  function beginEdit() {
    const input = h("input", {
      class: "title-input",
      type: "text",
    }) as HTMLInputElement;
    input.value = name;
    wrap.replaceChildren(input);
    input.focus();
    input.select();

    let settled = false;
    const finish = (save: boolean) => {
      if (settled) return;
      settled = true;
      const v = input.value.trim();
      if (save && v && v !== name) {
        onRename(v); // löst Reload + Re-Render in main aus
      } else {
        showDisplay(); // Anzeige unverändert wiederherstellen
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  showDisplay();
  return wrap;
}

/**
 * Vollständige Detailansicht einer Fahrt – alle Kennzahlen vertikal
 * untereinander (Hero, Route, Verlauf, Leistung, Zonen, Puls, Fazit, Coach).
 * Wird im Rides-Reiter je Fahrt als eine (horizontal wischbare) Karte gezeigt.
 * Mit `onRename` wird der Name direkt in der Karte bearbeitbar.
 */
export function activityDetail(
  a: Activity,
  profile: Profile,
  prev?: Activity,
  all: Activity[] = [],
  onRename?: (name: string) => void,
  onContextChange?: (ctx: ContextAnswers) => void,
): HTMLElement {
  const m = a.metrics;

  // Zonen mit aktuellem Profil neu berechnen, damit Modell-/Wert-Änderungen
  // (z. B. HRR/Ruhepuls) auch für bereits importierte Fahrten sofort greifen.
  m.powerZones = profile.ftp
    ? powerZoneModel(profile.ftp, a.samples.map((s) => s.power))
    : undefined;
  const maxHrRef = profile.maxHr ?? m.maxHr;
  m.hrZones = maxHrRef
    ? hrZoneModel(maxHrRef, profile.restHr, a.samples.map((s) => s.hr))
    : undefined;

  const title = onRename
    ? editableTitle(a.name, onRename)
    : h("div", { class: "hero-title" }, a.name);
  const gLabel = groupLabel(a.context?.group);
  const tLabel = typeLabel(a.context?.type);
  const badges =
    gLabel || tLabel
      ? h(
          "div",
          { class: "meta-badges" },
          gLabel ? h("span", { class: "meta-badge" }, gLabel) : null,
          tLabel ? h("span", { class: "meta-badge" }, tLabel) : null,
        )
      : null;
  const head = h(
    "div",
    { class: "card-head" },
    title,
    h(
      "div",
      { class: "hero-meta" },
      fmtDate(a.startTime) +
        (m.tempAvg !== undefined ? ` · ${n0(m.tempAvg)} °C` : ""),
    ),
    badges,
    effortBadge(m.intensity),
  );

  // Stufe 1: Hero-Zahlen
  const hero = heroStats([
    ["Distanz", fmtKm(m.distanceM).replace(" km", ""), "km"],
    ["Höhenmeter", n0(m.elevGain), "hm"],
    ["Fahrzeit", fmtDuration(m.durationMovingS)],
  ]);

  const heroBlock = h("div", { class: "hero-block" }, head, hero);
  const card = h("div", { class: "panel" }, heroBlock);

  // Kontext (Gruppe, Ziel, Wetter, Faktoren, Notiz) – anzeigen & bearbeiten.
  if (onContextChange)
    card.append(
      h("h2", { class: "section" }, "Kontext"),
      contextEditor(a.context, onContextChange),
    );

  // Stufe 2: Route (nur mit GPS)
  const route = drawRoute(a);
  if (route) card.append(h("h2", { class: "section" }, "Route"), route);

  // Stufe 2: Verlauf
  card.append(h("h2", { class: "section" }, "Verlauf"), drawTimeline(a, profile));

  // Stufe 2: Leistung (mit Info-Icons zu den Fachbegriffen)
  const power = statList(
    [
      row("Ø Leistung", m.avgPower !== undefined ? n0(m.avgPower) + " W" : "–"),
      row("Normalized Power", m.np !== undefined ? n0(m.np) + " W" : "–", "np"),
      row("Intensity Factor", n2(m.if), "if"),
      row("TSS", n0(m.tss), "tss"),
      row("Variabilität (VI)", n2(m.vi), "vi"),
      row("W/kg (NP)", n1(m.wPerKgNp), "wkg"),
      row("Kalorien", m.kcal !== undefined ? n0(m.kcal) + " kcal" : "–"),
    ],
    "power",
  );
  if (power) card.append(h("h2", { class: "section" }, "Leistung"), power);

  // Stufe 2: Zonen
  const zones = drawZones(a);
  if (zones) card.append(h("h2", { class: "section" }, "Zonen"), zones);

  // Stufe 3: Herzfrequenz & mehr
  const detail = statList(
    [
      row("Ø Puls", m.avgHr !== undefined ? n0(m.avgHr) + " bpm" : "–"),
      row("Max Puls", m.maxHr !== undefined ? n0(m.maxHr) + " bpm" : "–"),
      row("Ø Trittfrequenz", m.avgCadence !== undefined ? n0(m.avgCadence) + " rpm" : "–"),
      row("Ø Tempo", m.avgSpeed !== undefined ? fmtKmh(m.avgSpeed) : "–"),
      row("Max Tempo", m.maxSpeed !== undefined ? fmtKmh(m.maxSpeed) : "–"),
      row("Temperatur", m.tempAvg !== undefined ? n0(m.tempAvg) + " °C" : "–"),
    ],
    "hr",
  );
  if (detail)
    card.append(h("h2", { class: "section" }, "Herzfrequenz & mehr"), detail);

  // Aerobe Ausdauer: „Aerober Anteil" (windschatten-robust, alle Fahrten) +
  // Decoupling (aus Leistung UND Puls berechnet; bei viel Windschatten verfälscht
  // → dort ausgeblendet: Gruppe, unterwegs angeschlossen oder „viel Windschatten").
  const factors = new Set(a.context?.factors ?? []);
  const isGroup =
    a.context?.group === "group" ||
    factors.has("joined-group") ||
    factors.has("much-draft");
  let aerobShare = "–";
  if (m.hrZones && m.hrZones.seconds.length >= 2) {
    const total = m.hrZones.seconds.reduce((s, x) => s + x, 0);
    if (total > 0)
      aerobShare =
        n0(((m.hrZones.seconds[0] + m.hrZones.seconds[1]) / total) * 100) + " %";
  }
  const aerob = statList([
    row("Aerober Anteil", aerobShare, "aerob"),
    isGroup
      ? null
      : row(
          "Decoupling",
          m.decoupling !== undefined ? n1(m.decoupling) + " %" : "–",
          "decoupling",
        ),
  ]);
  if (aerob) card.append(h("h2", { class: "section" }, "Aerobe Ausdauer"), aerob);

  // Meilensteine (Top-3-Bestleistungen) + Bestwert-Tabelle je Zeitfenster.
  const milestoneEl = milestoneBadges(a, all);
  if (milestoneEl)
    card.append(h("h2", { class: "section" }, "Meilensteine"), milestoneEl);
  const efforts = bestEffortTable(a);
  if (efforts)
    card.append(h("h2", { class: "section" }, "Bestleistungen"), efforts);

  card.append(feedbackBlock(a, prev));
  card.append(coachBlock(a, profile, prev));

  return card;
}

