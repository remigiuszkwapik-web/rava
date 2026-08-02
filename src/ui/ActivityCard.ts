import { buildFeedback } from "../analysis/feedback";
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
import { drawTimeline, drawZones } from "./charts";
import { clear, h } from "./dom";
import { routeMap } from "./RouteMap";

function tile(k: string, value: string, unit?: string, cls = ""): HTMLElement {
  return h(
    "div",
    { class: "tile " + cls },
    h("div", { class: "k" }, k),
    h(
      "div",
      { class: "tile-value" },
      value,
      unit ? h("span", { class: "u" }, unit) : null,
    ),
  );
}

function intensityRow(intensity: number): HTMLElement {
  const bars: HTMLElement[] = [];
  for (let i = 1; i <= 10; i++) {
    bars.push(h("span", { class: "bar" + (i <= intensity ? " on" : "") }));
  }
  return h(
    "div",
    { class: "intensity" },
    ...bars,
    h("span", { class: "label" }, `Intensität ${intensity}/10`),
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

  const head = h(
    "div",
    { class: "card-head" },
    h(
      "div",
      { class: "meta" },
      `${sportLabel(a.sport)} · ${fmtDate(a.startTime)}` +
        (m.tempAvg !== undefined ? ` · ${n0(m.tempAvg)} °C` : ""),
    ),
    h("div", { class: "fazit" }, a.name),
    intensityRow(m.intensity),
  );

  const tiles = h(
    "div",
    { class: "tiles" },
    tile("Distanz", fmtKm(m.distanceM).replace(" km", ""), "km"),
    tile("Fahrzeit", fmtDuration(m.durationMovingS)),
    tile("Ø Tempo", m.avgSpeed ? fmtKmh(m.avgSpeed).replace(" km/h", "") : "–", "km/h"),
    tile("Höhenmeter", n0(m.elevGain), "hm"),
    tile("Ø Leistung", n0(m.avgPower), "W", "power"),
    tile("NP", n0(m.np), "W", "power"),
    tile("IF", n2(m.if), "", "power"),
    tile("TSS", n0(m.tss), "", "power"),
    tile("VI", n2(m.vi), "", "power"),
    tile("Ø Puls", n0(m.avgHr), "bpm", "hr"),
    tile("Max Puls", n0(m.maxHr), "bpm", "hr"),
    tile("Ø Trittf.", n0(m.avgCadence), "rpm"),
    tile("W/kg (NP)", n1(m.wPerKgNp)),
    tile("kcal", n0(m.kcal)),
  );

  const card = h(
    "div",
    { class: "panel" },
    head,
    tiles,
    h("h2", { style: { marginTop: "14px" } }, "Verlauf"),
    drawTimeline(a, profile),
  );

  const zones = drawZones(a);
  if (zones) {
    card.append(h("h2", { style: { marginTop: "14px" } }, "Zonen"), zones);
  }

  card.append(feedbackBlock(a, prev));
  card.append(coachBlock(a, profile, prev));

  const map = routeMap(a);

  const wrap = h("div", {}, card);
  if (map) wrap.append(map);

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
