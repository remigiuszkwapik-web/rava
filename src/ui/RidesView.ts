import type { Activity, Profile } from "../model";
import { activityDetail } from "./ActivityCard";
import { h } from "./dom";

export interface RidesViewHandlers {
  onDelete: (a: Activity) => void;
  /** Merkt sich die gerade sichtbare Fahrt (ohne Re-Render). */
  onView: (a: Activity) => void;
  /** Fahrt umbenennen (persistiert + Re-Render). */
  onRename: (a: Activity, name: string) => void;
}

const SLIDE_GAP = 12; // muss zu .deck { gap } in styles.css passen

/**
 * Rides-Reiter: alle Fahrten als horizontal wischbare Karten. Jede Karte zeigt
 * die Kennzahlen vertikal untereinander. Ein klebriger Indikator oben nennt
 * beim Scrollen die gerade betrachtete Fahrt.
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

  // Aktivitäten sind neueste zuerst; Start bei der aus Home gewählten Fahrt.
  const startIdx = Math.max(
    0,
    activities.findIndex((a) => a.id === selectedId),
  );

  // ---- Klebriger Fahrt-Indikator ----
  const nameEl = h("span", { class: "ri-name" });
  const countEl = h("span", { class: "ri-count" });
  const prevBtn = h("button", {
    class: "ri-arrow",
    type: "button",
    "aria-label": "Neuere Fahrt",
  });
  prevBtn.textContent = "‹";
  const nextBtn = h("button", {
    class: "ri-arrow",
    type: "button",
    "aria-label": "Ältere Fahrt",
  });
  nextBtn.textContent = "›";
  const indicator = h(
    "div",
    { class: "ride-indicator" },
    nameEl,
    h("div", { class: "ri-nav" }, countEl, prevBtn, nextBtn),
  );

  const deck = h("div", { class: "deck" });
  activities.forEach((a, i) => {
    const prev = activities[i + 1];
    const slide = h(
      "div",
      { class: "slide" },
      activityDetail(a, profile, prev, (name) => handlers.onRename(a, name)),
    );
    const del = h(
      "button",
      { class: "ghost", style: { width: "100%", marginBottom: "12px" } },
      "Aktivität löschen",
    );
    del.addEventListener("click", () => {
      if (confirm("Diese Aktivität löschen?")) handlers.onDelete(a);
    });
    slide.append(del);
    deck.append(slide);
  });

  const pitch = () => deck.clientWidth + SLIDE_GAP;
  const setActive = (i: number) => {
    const a = activities[i];
    if (!a) return;
    nameEl.textContent = a.name;
    countEl.textContent = `${i + 1} / ${activities.length}`;
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= activities.length - 1;
  };

  let raf = 0;
  deck.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(deck.scrollLeft / pitch());
      setActive(i);
      if (activities[i]) handlers.onView(activities[i]);
    });
  });
  prevBtn.addEventListener("click", () =>
    deck.scrollBy({ left: -pitch(), behavior: "smooth" }),
  );
  nextBtn.addEventListener("click", () =>
    deck.scrollBy({ left: pitch(), behavior: "smooth" }),
  );

  const wrap = h("div", {}, indicator, deck);

  setActive(startIdx);
  requestAnimationFrame(() => {
    deck.scrollLeft = pitch() * startIdx;
    // Indikator direkt unter der (klebrigen) Kopfleiste andocken.
    const tb = document.querySelector(".topbar") as HTMLElement | null;
    if (tb) indicator.style.top = tb.offsetHeight + "px";
  });

  return wrap;
}
