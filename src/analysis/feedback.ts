import { fmtDuration, fmtKm, n0, n1, n2 } from "../format";
import type { Activity, ZoneModel } from "../model";
import { factorLabel } from "../ui/contextForm";
import { hardestClimb } from "./segments";

export interface Feedback {
  fazit: string;
  intensity: number;
  analyse: string[];
  heraus: string[];
  vergleich: string[];
  empfehlung: string[];
}

function dominantZone(z?: ZoneModel): { label: string; pct: number } | undefined {
  if (!z) return undefined;
  const total = z.seconds.reduce((a, b) => a + b, 0);
  if (!total) return undefined;
  let idx = 0;
  for (let i = 1; i < z.seconds.length; i++) if (z.seconds[i] > z.seconds[idx]) idx = i;
  return { label: z.labels[idx], pct: Math.round((z.seconds[idx] / total) * 100) };
}

function halfSplit(a: Activity): {
  p1?: number;
  p2?: number;
  s1?: number;
  s2?: number;
} {
  const s = a.samples;
  if (s.length < 4) return {};
  const mid = s[Math.floor(s.length / 2)].t;
  const first = s.filter((x) => x.t < mid);
  const second = s.filter((x) => x.t >= mid);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : undefined;
  return {
    p1: avg(first.map((x) => x.power ?? 0).filter((v) => v > 0)),
    p2: avg(second.map((x) => x.power ?? 0).filter((v) => v > 0)),
    s1: avg(first.map((x) => x.speed).filter((v): v is number => v !== undefined)),
    s2: avg(second.map((x) => x.speed).filter((v): v is number => v !== undefined)),
  };
}

function characterWord(intensity: number): string {
  if (intensity <= 3) return "Lockere Rekom-/Grundlageneinheit";
  if (intensity <= 5) return "Ruhige Grundlagenfahrt";
  if (intensity <= 7) return "Solide Tempoeinheit";
  if (intensity <= 8) return "Harte, intensive Einheit";
  return "Sehr harte, fast maximale Einheit";
}

export function buildFeedback(
  a: Activity,
  prev?: Activity,
): Feedback {
  const m = a.metrics;
  const climb = hardestClimb(a.phases);
  const surges = a.phases.filter((p) => p.kind === "surge").length;

  // Angeklickte Kontext-Faktoren – zur Einordnung der Kennzahlen.
  const F = new Set(a.context?.factors ?? []);
  const has = (k: string) => F.has(k);
  // Windschatten verfälscht Leistung/Puls (Decoupling, VI): Gruppenfahrt ODER
  // unterwegs angeschlossen ODER explizit „viel Windschatten“.
  const draftHeavy =
    a.context?.group === "group" || has("joined-group") || has("much-draft");
  // Erwarteter Einbruch in der 2. Hälfte (durch Nutzer gemeldet).
  const fade = has("fade-2nd") || has("bonk") || has("cramp");

  // ---- 1. Fazit ----
  const bits: string[] = [];
  if (climb) bits.push("mit kräftigem Anstieg");
  else if (surges >= 3) bits.push(`mit ${surges} Antritten`);
  if (a.context?.group === "group") bits.push("in der Gruppe");
  else if (has("joined-group")) bits.push("unterwegs in einer Gruppe");
  const fazit =
    `${characterWord(m.intensity)} ${bits.join(", ")}`.trim() +
    ` über ${fmtKm(m.distanceM)} (${fmtDuration(m.durationMovingS)}).`;

  // ---- 3. Analyse ----
  const analyse: string[] = [];
  const pz = dominantZone(m.powerZones);
  const hz = dominantZone(m.hrZones);
  if (pz)
    analyse.push(
      `Zeit vor allem in Leistungszone ${pz.label} (${pz.pct} %).` +
        (hz ? ` HF-seitig dominiert ${hz.label} (${hz.pct} %).` : ""),
    );
  else if (hz)
    analyse.push(`Belastung HF-seitig überwiegend in Zone ${hz.label} (${hz.pct} %).`);

  if (m.np && m.avgPower) {
    const vi = m.vi ?? m.np / m.avgPower;
    const viTxt =
      vi >= 1.12
        ? "sehr variabel (viele Wechsel/Stop-and-go oder Windschatten)"
        : vi >= 1.05
          ? "leicht wechselhaft"
          : "sehr gleichmäßig getreten";
    analyse.push(
      `NP ${n0(m.np)} W vs. Ø ${n0(m.avgPower)} W → VI ${n2(vi)}, ${viTxt}.` +
        (m.wPerKgNp ? ` Das sind ${n1(m.wPerKgNp)} W/kg (NP).` : ""),
    );
  }

  const fadeReason = has("bonk")
    ? " – passt zum gemeldeten Hungerast."
    : has("cramp")
      ? " – passt zu den gemeldeten Krämpfen."
      : has("fade-2nd")
        ? " – deckt sich mit dem gemeldeten Einbruch."
        : "";
  const hs = halfSplit(a);
  if (hs.p1 && hs.p2) {
    const diff = Math.round(((hs.p2 - hs.p1) / hs.p1) * 100);
    analyse.push(
      diff <= -8
        ? `Pacing: zweite Hälfte deutlich schwächer (${diff} %) – Einbruch zum Ende${fadeReason || "."}`
        : diff >= 8
          ? `Pacing: negativ gesplittet, zweite Hälfte stärker (+${diff} %). Stark.`
          : `Pacing: gleichmäßig über beide Hälften (${diff >= 0 ? "+" : ""}${diff} %).`,
    );
  } else if (hs.s1 && hs.s2) {
    const diff = Math.round(((hs.s2 - hs.s1) / hs.s1) * 100);
    analyse.push(
      `Pacing (Tempo): zweite Hälfte ${diff >= 0 ? "+" : ""}${diff} % ggü. erster.` +
        (has("wind-mixed") || has("wind-tail") || has("wind-head")
          ? " Bei wechselndem/starkem Wind ist der Tempo-Split nur bedingt aussagekräftig."
          : ""),
    );
  }

  if (climb) analyse.push(`Härtester Abschnitt: ${climb.label}.`);

  // Decoupling bei viel Windschatten weglassen – verzerrt Leistung/Puls.
  if (m.decoupling !== undefined && !draftHeavy) {
    const highReason = has("heat")
      ? "die gemeldete Hitze"
      : fade
        ? "der gemeldete Einbruch (Hunger/Krämpfe)"
        : has("tired-start") || has("sick")
          ? "der angeschlagene/vorbelastete Start"
          : "Ermüdung/Hitze/wenig Grundlage";
    analyse.push(
      m.decoupling >= 8
        ? `Kardiovaskuläres Decoupling ${n1(m.decoupling)} % – HF driftet bei gleicher Leistung nach oben (${highReason}).`
        : m.decoupling <= -3
          ? `Decoupling ${n1(m.decoupling)} % – Effizienz stieg im Verlauf (gutes Einfahren).`
          : `Decoupling ${n1(m.decoupling)} % – aerob stabil, gute Ausdauerbasis.`,
    );
  } else if (m.decoupling !== undefined && draftHeavy) {
    analyse.push(
      "Decoupling ausgeblendet – bei viel Windschatten (Gruppe/Anschluss) verzerrt der Windschatten das Leistung-zu-Puls-Verhältnis.",
    );
  }
  if (has("long-stops"))
    analyse.push(
      "Viele Stopps/Ampeln gemeldet – hohe Variabilität und niedriger Ø-Schnitt sind dadurch mit erklärt.",
    );
  if (a.context?.factors?.length)
    analyse.push(
      "Kontext berücksichtigt: " +
        a.context.factors.map(factorLabel).join(", ") +
        ".",
    );
  if (!analyse.length)
    analyse.push("Wenige Datenkanäle vorhanden – Analyse auf Basis von Zeit/Distanz.");

  // ---- 4. Was heraussticht ----
  const heraus: string[] = [];
  if (m.maxPower) heraus.push(`Spitzenleistung ${n0(m.maxPower)} W.`);
  if (climb) heraus.push(`Sauber durchgezogener Anstieg (${climb.label}).`);
  if (hs.p1 && hs.p2 && hs.p2 >= hs.p1) heraus.push("Kraft bis zum Schluss gehalten.");
  if (m.decoupling !== undefined && m.decoupling >= 10 && !draftHeavy)
    heraus.push(
      fade || has("heat") || has("tired-start") || has("sick")
        ? "Hohes Decoupling – durch den gemeldeten Kontext (Einbruch/Hitze/vorbelastet) erklärbar, nicht zwingend ein Trainingsproblem."
        : "Draufschauen: hohes Decoupling – evtl. zu hart angefangen oder unterversorgt.",
    );
  if (m.avgHr && m.avgPower && m.if && m.if < 0.6 && m.avgHr > (a.metrics.maxHr ?? 999) * 0.8)
    heraus.push(
      has("tired-start") || has("sick") || has("heat")
        ? "Hohe HF bei niedriger Leistung – passt zum gemeldeten Zustand (vorbelastet/angeschlagen/Hitze)."
        : "Draufschauen: hohe HF bei niedriger Leistung – Müdigkeit/Hitze?",
    );
  for (const miss of m.missing) heraus.push(`Hinweis: ${miss}.`);
  if (!heraus.length) heraus.push("Runde, unauffällige Einheit ohne Ausreißer.");

  // ---- 5. Vergleich ----
  const vergleich: string[] = [];
  if (prev) {
    const cmp = (label: string, cur?: number, old?: number, unit = "", better: "up" | "down" = "up") => {
      if (cur === undefined || old === undefined || !old) return;
      const d = Math.round(((cur - old) / old) * 100);
      const good = better === "up" ? d >= 0 : d <= 0;
      vergleich.push(
        `${label}: ${n0(cur)}${unit} vs. ${n0(old)}${unit} (${d >= 0 ? "+" : ""}${d} %, ${good ? "besser" : "schwächer"}).`,
      );
    };
    vergleich.push(`Vergleich mit „${prev.name}" (${fmtKm(prev.metrics.distanceM)}):`);
    cmp("TSS", m.tss, prev.metrics.tss);
    cmp("NP", m.np, prev.metrics.np, " W");
    cmp("Ø-HF", m.avgHr, prev.metrics.avgHr, " bpm", "down");
    cmp("Ø-Tempo", m.avgSpeed ? m.avgSpeed * 3.6 : undefined, prev.metrics.avgSpeed ? prev.metrics.avgSpeed * 3.6 : undefined, " km/h");
    if (has("wind-tail") || has("wind-head") || has("wind-mixed") || draftHeavy)
      vergleich.push(
        "Achtung: Wind/Windschatten gemeldet – Tempo- und Leistungsvergleich nur mit Vorsicht deuten.",
      );
  }

  // ---- 6. Empfehlung ----
  const empfehlung: string[] = [];
  const tss = m.tss ?? m.intensity * 12;
  if (tss < 50 || m.intensity <= 4) {
    empfehlung.push("Geringe Belastung – morgen wieder voll belastbar.");
    empfehlung.push("Idee: nächste Fahrt ruhig ein paar Tempoblöcke oder kurze Intervalle einbauen.");
  } else if (tss < 110) {
    empfehlung.push("Moderate Belastung – 1 Tag locker oder Rekom einplanen.");
    empfehlung.push("Idee: als Nächstes eine gezielte Schwellen- oder VO2-Einheit.");
  } else {
    empfehlung.push("Hohe Belastung – 1–2 Tage Erholung, auf Schlaf und Ernährung achten.");
    empfehlung.push("Idee: nächste Einheit bewusst locker (Grundlage/Rekom) zur Regeneration.");
  }

  return { fazit, intensity: m.intensity, analyse, heraus, vergleich, empfehlung };
}
