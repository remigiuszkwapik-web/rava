import type { Activity, Profile } from "../model";
import { activitySections } from "./ActivityCard";
import { h } from "./dom";

export interface RidesViewHandlers {
  onDelete: (a: Activity) => void;
  onSelect: (a: Activity) => void;
}

/**
 * Rides-Reiter: zeigt eine Fahrt (die aus Home gewählte, sonst die neueste)
 * mit horizontal swipebaren Abschnitten und Punkte-Navigation.
 */
export function ridesView(
  activities: Activity[],
  profile: Profile,
  selectedId: string | undefined,
  handlers: RidesViewHandlers,
): HTMLElement {
  if (!activities.length) {
    return h(
      "div",
      { class: "empty" },
      h("p", {}, "Noch keine Fahrten."),
      h("p", { class: "muted" }, "Lade im Reiter „Home“ eine Datei hoch."),
    );
  }

  // Aktivitäten sind neueste zuerst.
  let idx = activities.findIndex((a) => a.id === selectedId);
  if (idx < 0) idx = 0;
  const a = activities[idx];
  const prev = activities[idx + 1];

  const wrap = h("div", {});

  // Fahrt-Wechsler (nur bei mehreren Fahrten): ‹ neuere · Zähler · ältere ›
  if (activities.length > 1) {
    const prevBtn = h(
      "button",
      { class: "ghost", style: { width: "auto", padding: "8px 16px" } },
      "‹",
    );
    const nextBtn = h(
      "button",
      { class: "ghost", style: { width: "auto", padding: "8px 16px" } },
      "›",
    );
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= activities.length - 1;
    prevBtn.addEventListener("click", () => handlers.onSelect(activities[idx - 1]));
    nextBtn.addEventListener("click", () => handlers.onSelect(activities[idx + 1]));
    wrap.append(
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
        },
        prevBtn,
        h("span", { class: "muted" }, `Fahrt ${idx + 1} / ${activities.length}`),
        nextBtn,
      ),
    );
  }

  const sections = activitySections(a, profile, prev);

  const deck = h("div", { class: "section-deck" });
  sections.forEach((s) =>
    deck.append(h("div", { class: "section-slide" }, s.el)),
  );

  const dots = h("div", { class: "deck-dots" });
  sections.forEach((_, i) =>
    dots.append(h("span", { class: "dot" + (i === 0 ? " on" : "") })),
  );
  deck.addEventListener("scroll", () => {
    const i = Math.round(deck.scrollLeft / deck.clientWidth);
    Array.from(dots.children).forEach((d, j) =>
      d.classList.toggle("on", j === i),
    );
  });

  wrap.append(deck, dots);

  const del = h(
    "button",
    { class: "ghost", style: { width: "100%", marginTop: "6px" } },
    "Aktivität löschen",
  );
  del.addEventListener("click", () => {
    if (confirm("Diese Aktivität löschen?")) handlers.onDelete(a);
  });
  wrap.append(del);

  return wrap;
}
