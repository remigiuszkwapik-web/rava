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
import type { Activity, Profile } from "../model";
import { getApiKey, getCoachModel } from "../state/settings";
import { drawRoute, drawTimeline, drawZones } from "./charts";
import { clear, h } from "./dom";

/** Kurzerklärungen zu Fachbegriffen (Info-Icon in den Kennzahlen). */
const GLOSSARY: Record<string, string> = {
  np: "Normalized Power (NP): gewichtete Durchschnittsleistung, die kurze harte Abschnitte stärker berücksichtigt als der reine Mittelwert – näher am tatsächlich empfundenen Aufwand.",
  if: "Intensity Factor (IF): NP im Verhältnis zur FTP. 1,0 = eine Stunde am Limit, ~0,7 lockere Grundlage.",
  tss: "Training Stress Score (TSS): Gesamtbelastung aus Dauer und Intensität. 100 entspricht etwa einer harten Stunde an der Schwelle (FTP).",
  vi: "Variabilität (VI): NP geteilt durch die Durchschnittsleistung. Nahe 1,0 = sehr gleichmäßig getreten, höher = viele Antritte und Pausen.",
  wkg: "W/kg: Leistung pro Kilogramm Körpergewicht (auf Basis der NP) – macht die Leistung unabhängig vom Gewicht vergleichbar.",
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

export interface RideSection {
  title: string;
  el: HTMLElement;
}

/**
 * Zerlegt eine Fahrt in einzelne, swipebare Abschnitte (je ein Panel).
 * Wird vom Rides-Reiter als horizontaler Swiper dargestellt.
 */
export function activitySections(
  a: Activity,
  profile: Profile,
  prev?: Activity,
): RideSection[] {
  const m = a.metrics;

  // Zonen mit aktuellem Profil neu berechnen (wie in activityCard).
  m.powerZones = profile.ftp
    ? powerZoneModel(profile.ftp, a.samples.map((s) => s.power))
    : undefined;
  const maxHrRef = profile.maxHr ?? m.maxHr;
  m.hrZones = maxHrRef
    ? hrZoneModel(maxHrRef, profile.restHr, a.samples.map((s) => s.hr))
    : undefined;

  const sectionPanel = (title: string, ...content: (Node | null)[]) =>
    h(
      "div",
      { class: "panel" },
      h("div", { class: "section-title" }, title),
      ...content,
    );

  const sections: RideSection[] = [];

  // Übersicht: Hero-Block (Titel, Meta, Kennzahlen)
  const head = h(
    "div",
    { class: "card-head" },
    h("div", { class: "hero-title" }, a.name),
    h(
      "div",
      { class: "hero-meta" },
      fmtDate(a.startTime) +
        (m.tempAvg !== undefined ? ` · ${n0(m.tempAvg)} °C` : ""),
    ),
    effortBadge(m.intensity),
  );
  const hero = heroStats([
    ["Distanz", fmtKm(m.distanceM).replace(" km", ""), "km"],
    ["Höhenmeter", n0(m.elevGain), "hm"],
    ["Fahrzeit", fmtDuration(m.durationMovingS)],
  ]);
  sections.push({
    title: "Übersicht",
    el: h("div", { class: "hero-block" }, head, hero),
  });

  const route = drawRoute(a);
  if (route) sections.push({ title: "Route", el: sectionPanel("Route", route) });

  sections.push({
    title: "Verlauf",
    el: sectionPanel("Verlauf", drawTimeline(a, profile)),
  });

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
  if (power)
    sections.push({ title: "Leistung", el: sectionPanel("Leistung", power) });

  const zones = drawZones(a);
  if (zones) sections.push({ title: "Zonen", el: sectionPanel("Zonen", zones) });

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
    sections.push({
      title: "Herzfrequenz",
      el: sectionPanel("Herzfrequenz & mehr", detail),
    });

  sections.push({
    title: "Fazit",
    el: h("div", { class: "panel" }, feedbackBlock(a, prev)),
  });

  sections.push({
    title: "Coach",
    el: sectionPanel("Coach-Kommentar", coachBlock(a, profile, prev)),
  });

  return sections;
}
