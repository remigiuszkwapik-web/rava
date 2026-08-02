import type { Activity } from "../model";
import { drawRoute } from "./charts";
import { h } from "./dom";

/**
 * Routen-Ansicht. Aktuell offline-Polyline (aus GPS-Punkten, ohne Tiles).
 * Zukunft: echte Basiskarte (Leaflet + OSM-Tiles) hier nachrüstbar –
 * die GPS-Punkte werden bereits pro Aktivität gespeichert.
 */
export function routeMap(a: Activity): HTMLElement | null {
  const canvas = drawRoute(a);
  if (!canvas) return null;
  return h(
    "div",
    { class: "panel" },
    h("h2", {}, "Route"),
    canvas,
    h(
      "div",
      { class: "muted", style: { marginTop: "6px" } },
      "Offline-Streckenverlauf (Höhe eingefärbt). Basiskarte folgt später.",
    ),
  );
}
