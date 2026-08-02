import type { Profile } from "../model";
import { defaultProfileSeed } from "../state/profile";
import { h } from "./dom";

type ProfileData = Omit<Profile, "id" | "createdAt">;

function numOrUndef(v: string): number | undefined {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function profileForm(
  initial: Partial<Profile>,
  submitLabel: string,
  onSubmit: (data: ProfileData) => void,
): HTMLElement {
  const name = h("input", { type: "text", value: initial.name ?? "", placeholder: "Name" });
  const weight = h("input", { type: "number", step: "0.1", value: initial.weightKg ?? "" });
  const ftp = h("input", { type: "number", value: initial.ftp ?? "" });
  const maxHr = h("input", { type: "number", value: initial.maxHr ?? "" });
  const restHr = h("input", { type: "number", value: initial.restHr ?? "" });
  const thrHr = h("input", { type: "number", value: initial.thresholdHr ?? "" });
  const age = h("input", { type: "number", value: initial.age ?? "" });
  const notes = h("textarea", { rows: "2" }) as HTMLTextAreaElement;
  notes.value = initial.setupNotes ?? "";

  const err = h("div", { class: "error" });
  const btn = h("button", { class: "primary" }, submitLabel);
  btn.addEventListener("click", () => {
    if (!name.value.trim()) {
      err.textContent = "Bitte einen Namen angeben.";
      return;
    }
    onSubmit({
      name: name.value.trim(),
      weightKg: numOrUndef(weight.value),
      ftp: numOrUndef(ftp.value),
      maxHr: numOrUndef(maxHr.value),
      restHr: numOrUndef(restHr.value),
      thresholdHr: numOrUndef(thrHr.value),
      age: numOrUndef(age.value),
      setupNotes: notes.value.trim() || undefined,
    });
  });

  return h(
    "div",
    {},
    h("label", {}, "Name"),
    name,
    h(
      "div",
      { class: "row" },
      h("div", {}, h("label", {}, "Gewicht (kg)"), weight),
      h("div", {}, h("label", {}, "FTP (Watt)"), ftp),
    ),
    h(
      "div",
      { class: "row" },
      h("div", {}, h("label", {}, "Max. HF (bpm)"), maxHr),
      h("div", {}, h("label", {}, "Ruhe-HF (bpm)"), restHr),
    ),
    h(
      "div",
      { class: "row" },
      h("div", {}, h("label", {}, "HF-Schwelle (bpm)"), thrHr),
      h("div", {}, h("label", {}, "Alter"), age),
    ),
    h("label", {}, "Rad-/Setup-Notizen"),
    notes,
    err,
    btn,
  );
}

export function onboardingView(onSubmit: (data: ProfileData) => void): HTMLElement {
  return h(
    "div",
    { class: "panel" },
    h("h1", {}, "Willkommen bei Rava"),
    h(
      "p",
      { class: "muted" },
      "Lege dein Athletenprofil an. Alle Werte lassen sich später ändern, und du kannst weitere Profile hinzufügen (z. B. für Trainingspartner).",
    ),
    profileForm(defaultProfileSeed(), "Profil anlegen", onSubmit),
  );
}

export interface ProfileHandlers {
  onCreate: (data: ProfileData) => void;
  onUpdate: (p: Profile) => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function profileView(
  profiles: Profile[],
  activeId: string | undefined,
  handlers: ProfileHandlers,
): HTMLElement {
  const wrap = h("div", {});

  // aktives Profil bearbeiten
  const active = profiles.find((p) => p.id === activeId);
  if (active) {
    wrap.append(
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Aktives Profil bearbeiten"),
        profileForm(active, "Speichern", (data) =>
          handlers.onUpdate({ ...active, ...data }),
        ),
      ),
    );
  }

  // Liste aller Profile
  const list = h("div", { class: "panel" }, h("h2", {}, "Profile"));
  for (const p of profiles) {
    const activateBtn = h(
      "button",
      { class: "ghost" },
      p.id === activeId ? "aktiv" : "wählen",
    );
    if (p.id !== activeId)
      activateBtn.addEventListener("click", () => handlers.onActivate(p.id));
    else activateBtn.setAttribute("disabled", "true");

    const delBtn = h("button", { class: "ghost" }, "löschen");
    delBtn.addEventListener("click", () => {
      if (profiles.length <= 1) {
        alert("Das letzte Profil kann nicht gelöscht werden.");
        return;
      }
      if (confirm(`Profil „${p.name}" samt Aktivitäten löschen?`))
        handlers.onDelete(p.id);
    });

    list.append(
      h(
        "div",
        { class: "list-item" },
        h(
          "div",
          { class: "grow" },
          h("div", {}, p.name),
          h(
            "small",
            {},
            [p.ftp ? `FTP ${p.ftp} W` : null, p.weightKg ? `${p.weightKg} kg` : null, p.maxHr ? `HFmax ${p.maxHr}` : null]
              .filter(Boolean)
              .join(" · ") || "keine Werte",
          ),
        ),
        activateBtn,
        delBtn,
      ),
    );
  }
  wrap.append(list);

  // neues Profil
  wrap.append(
    h(
      "div",
      { class: "panel" },
      h("h2", {}, "Neues Profil"),
      profileForm({ name: "" }, "Profil hinzufügen", handlers.onCreate),
    ),
  );

  return wrap;
}
