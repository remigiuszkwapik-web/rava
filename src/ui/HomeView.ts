import { fmtDate, fmtDuration, fmtKm } from "../format";
import type { Activity, Profile } from "../model";
import type { IngestResult } from "../import/ingest";
import { h } from "./dom";
import { addRidePanel } from "./UploadView";

export interface HomeViewHandlers {
  onUploaded: (r: IngestResult) => void;
  onSelect: (a: Activity) => void;
}

/** Kompakte Zusammenfassungskarte einer Fahrt (Home). Tap → Rides-Detail. */
function rideSummaryCard(a: Activity, onSelect: (a: Activity) => void): HTMLElement {
  const m = a.metrics;
  const card = h(
    "div",
    { class: "ride-card" },
    h("div", { class: "rc-title" }, a.name),
    h("div", { class: "rc-date" }, fmtDate(a.startTime)),
    h(
      "div",
      { class: "stat-bar" },
      h(
        "div",
        { class: "sb" },
        fmtKm(m.distanceM).replace(" km", ""),
        h("span", { class: "u" }, "km"),
      ),
      h("div", { class: "sb" }, fmtDuration(m.durationMovingS)),
    ),
  );
  card.addEventListener("click", () => onSelect(a));
  return card;
}

/**
 * Home-Reiter: „Add Ride“ als Hauptaktion oben, darunter alle hochgeladenen
 * Fahrten als kompakte Karten untereinander.
 */
export function homeView(
  activities: Activity[],
  profile: Profile,
  handlers: HomeViewHandlers,
): HTMLElement {
  const root = h("div", {}, addRidePanel(profile, handlers.onUploaded));

  if (!activities.length) {
    root.append(
      h(
        "div",
        { class: "empty" },
        h("p", {}, "Noch keine Fahrten."),
        h(
          "p",
          { class: "muted" },
          "Lade oben eine FIT-/GPX-/TCX-Datei oder deinen Strava-Export hoch.",
        ),
      ),
    );
  } else {
    activities.forEach((a) => root.append(rideSummaryCard(a, handlers.onSelect)));
  }

  return root;
}
