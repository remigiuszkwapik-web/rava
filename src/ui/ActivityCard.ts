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
  sportLabel,
} from "../format";
import { coachComment } from "../llm/coach";
import type { Activity, Profile } from "../model";
import { getApiKey, getCoachModel } from "../state/settings";
import { drawRoute, drawTimeline, drawZones } from "./charts";
import { clear, h } from "./dom";

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

/** Zeile nur behalten, wenn ein echter Wert vorliegt. */
function row(k: string, v: string): [string, string] | null {
  return v === "–" || v === "" ? null : [k, v];
}

function statList(
  rows: Array<[string, string] | null>,
  accent = "",
): HTMLElement | null {
  const r = rows.filter((x): x is [string, string] => x !== null);
  if (!r.length) return null;
  return h(
    "div",
    { class: ("stat-list " + accent).trim() },
    ...r.map(([k, v]) =>
      h(
        "div",
        { class: "stat-row" },
        h("span", { class: "k" }, k),
        h("span", { class: "v" }, v),
      ),
    ),
  );
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

export interface ActivityCardHandlers {
  onDelete?: (a: Activity) => void;
}

export function activityCard(
  a: Activity,
  profile: Profile,
  prev: Activity | undefined,
  handlers: ActivityCardHandlers = {},
): HTMLElement {
  const m = a.metrics;

  // Zonen mit dem aktuellen Profil neu berechnen, damit Modell-/Wert-Änderungen
  // (z. B. HRR/Ruhepuls) auch für bereits importierte Fahrten sofort greifen.
  m.powerZones = profile.ftp
    ? powerZoneModel(profile.ftp, a.samples.map((s) => s.power))
    : undefined;
  const maxHrRef = profile.maxHr ?? m.maxHr;
  m.hrZones = maxHrRef
    ? hrZoneModel(maxHrRef, profile.restHr, a.samples.map((s) => s.hr))
    : undefined;

  const head = h(
    "div",
    { class: "card-head" },
    h("div", { class: "hero-title" }, a.name),
    h(
      "div",
      { class: "hero-meta" },
      `${sportLabel(a.sport)} · ${fmtDate(a.startTime)}` +
        (m.tempAvg !== undefined ? ` · ${n0(m.tempAvg)} °C` : ""),
    ),
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

  // Stufe 2: Route direkt unter den Hero-Zahlen (nur mit GPS)
  const route = drawRoute(a);
  if (route) card.append(h("h2", { class: "section" }, "Route"), route);

  // Stufe 2: Verlauf
  card.append(h("h2", { class: "section" }, "Verlauf"), drawTimeline(a, profile));

  // Stufe 2: Leistung (Amber-Akzent)
  const power = statList(
    [
      row("Ø Leistung", m.avgPower !== undefined ? n0(m.avgPower) + " W" : "–"),
      row("Normalized Power", m.np !== undefined ? n0(m.np) + " W" : "–"),
      row("Intensity Factor", n2(m.if)),
      row("TSS", n0(m.tss)),
      row("Variabilität (VI)", n2(m.vi)),
      row("W/kg (NP)", n1(m.wPerKgNp)),
      row("Kalorien", m.kcal !== undefined ? n0(m.kcal) + " kcal" : "–"),
    ],
    "power",
  );
  if (power) card.append(h("h2", { class: "section" }, "Leistung"), power);

  // Stufe 2: Zonen
  const zones = drawZones(a);
  if (zones) card.append(h("h2", { class: "section" }, "Zonen"), zones);

  // Stufe 3: Herzfrequenz & mehr (dezent)
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

  card.append(feedbackBlock(a, prev));
  card.append(coachBlock(a, profile, prev));

  const wrap = h("div", {}, card);

  if (handlers.onDelete) {
    const del = h(
      "button",
      { class: "ghost", style: { width: "100%", marginBottom: "12px" } },
      "Aktivität löschen",
    );
    del.addEventListener("click", () => {
      if (confirm("Diese Aktivität löschen?")) handlers.onDelete!(a);
    });
    wrap.append(del);
  }
  return wrap;
}
