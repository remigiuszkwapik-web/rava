import type { Activity, Profile } from "../model";
import { activityCard } from "./ActivityCard";
import { h } from "./dom";

export function swipeDeck(
  activities: Activity[],
  profile: Profile,
  onDelete: (a: Activity) => void,
): HTMLElement {
  if (!activities.length) {
    return h(
      "div",
      { class: "empty" },
      h("p", {}, "Noch keine Aktivitäten."),
      h("p", { class: "muted" }, "Lade oben unter „Upload“ eine FIT-/GPX-/TCX-Datei oder deinen Strava-Export hoch."),
    );
  }

  const deck = h("div", { class: "deck" });
  // activities sind neueste zuerst → prev = nächst-ältere
  activities.forEach((a, i) => {
    const prev = activities[i + 1];
    deck.append(h("div", { class: "slide" }, activityCard(a, profile, prev, { onDelete })));
  });

  const dots = h("div", { class: "deck-dots" });
  activities.forEach((_, i) =>
    dots.append(h("span", { class: "dot" + (i === 0 ? " on" : "") })),
  );

  deck.addEventListener("scroll", () => {
    const idx = Math.round(deck.scrollLeft / deck.clientWidth);
    Array.from(dots.children).forEach((d, i) =>
      d.classList.toggle("on", i === idx),
    );
  });

  const wrap = h("div", {});
  if (activities.length > 1) wrap.append(dots);
  wrap.append(deck);
  return wrap;
}
