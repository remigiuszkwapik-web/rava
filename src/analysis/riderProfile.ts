import { fmtDateShort, fmtKm, n0, n1, n2 } from "../format";
import type { Activity, Profile } from "../model";
import { hrZoneModel, powerZoneModel } from "./metrics";
import { hardestClimb } from "./segments";

const WINDOW_DAYS = 42; // ~6 Wochen
const DAY_MS = 86_400_000;

/** Mittelwert über die vorhandenen (definierten) Werte, sonst undefined. */
function avg(xs: Array<number | undefined>): number | undefined {
  const v = xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
  if (!v.length) return undefined;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Leistungszonen als lesbare Watt-Bänder (Z1–Z7) aus der FTP. */
function powerZonesText(ftp: number): string[] {
  const b = powerZoneModel(ftp, []).bounds; // Obergrenzen, letzte = Infinity
  const names = [
    "Z1 Rekom",
    "Z2 Grundlage",
    "Z3 Tempo",
    "Z4 Schwelle",
    "Z5 VO2max",
    "Z6 anaerob",
    "Z7 neuromuskulär",
  ];
  const out: string[] = [];
  let lo = 0;
  for (let i = 0; i < b.length; i++) {
    const hi = b[i];
    if (hi === Infinity) out.push(`  ${names[i]}: > ${lo} W`);
    else out.push(`  ${names[i]}: ${lo}–${hi} W`);
    lo = hi === Infinity ? lo : hi;
  }
  return out;
}

/** HF-Zonen als bpm-Grenzen (Z1–Z5). */
function hrZonesText(maxHr: number, restHr?: number): string[] {
  const b = hrZoneModel(maxHr, restHr, []).bounds; // Obergrenzen
  const names = ["Z1 Rekom", "Z2 Grundlage", "Z3 Tempo", "Z4 Schwelle", "Z5 VO2max"];
  const out: string[] = [];
  let lo = 0;
  for (let i = 0; i < b.length; i++) {
    if (i === b.length - 1) out.push(`  ${names[i]}: > ${lo} bpm`);
    else out.push(`  ${names[i]}: ${lo}–${b[i]} bpm`);
    lo = b[i];
  }
  return out;
}

/**
 * Kompakter, kopierbarer Fahrerprofil-Text: Athletendaten, Ziel-Zonen und die
 * aktuelle Form aus der Fahrten-Historie. Zum Einfügen in Claude o. Ä. (z. B.
 * zusammen mit einer geplanten GPX-Route). Fehlende Werte werden weggelassen.
 */
export function buildRiderProfileText(
  profile: Profile,
  activities: Activity[],
): string {
  const lines: string[] = [];

  // ---- Athlet ----
  lines.push("FAHRERPROFIL");
  if (profile.name?.trim()) lines.push(`Name: ${profile.name.trim()}`);
  if (profile.age !== undefined) lines.push(`Alter: ${n0(profile.age)} Jahre`);
  if (profile.weightKg !== undefined) lines.push(`Gewicht: ${n1(profile.weightKg)} kg`);
  if (profile.ftp !== undefined) {
    const wkg =
      profile.weightKg && profile.weightKg > 0
        ? ` (${n1(profile.ftp / profile.weightKg)} W/kg)`
        : "";
    lines.push(`FTP: ${n0(profile.ftp)} W${wkg}`);
  }
  if (profile.maxHr !== undefined) lines.push(`Max. Puls: ${n0(profile.maxHr)} bpm`);
  if (profile.restHr !== undefined) lines.push(`Ruhepuls: ${n0(profile.restHr)} bpm`);

  // ---- Zielzonen ----
  if (profile.ftp !== undefined) {
    lines.push("", "Leistungszonen:", ...powerZonesText(profile.ftp));
  }
  if (profile.maxHr !== undefined) {
    lines.push("", "Herzfrequenz-Zonen:", ...hrZonesText(profile.maxHr, profile.restHr));
  }

  // ---- Aktuelle Form (letzte ~6 Wochen) ----
  const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
  const recent = activities.filter((a) => a.startTime >= cutoff);
  if (recent.length) {
    const form: string[] = [];
    form.push(`Fahrten: ${recent.length}`);

    // Ø Wochen-TSS über die tatsächliche Datenspanne (max. 6 Wochen).
    const totalTss = recent.reduce((s, a) => s + (a.metrics.tss ?? 0), 0);
    if (totalTss > 0) {
      const earliest = Math.min(...recent.map((a) => a.startTime));
      const weeks = Math.min(6, Math.max(1, (Date.now() - earliest) / (7 * DAY_MS)));
      form.push(`Ø Wochenbelastung: ${n0(totalTss / weeks)} TSS`);
    }

    const longest = recent.reduce((m, a) =>
      a.metrics.distanceM > m.metrics.distanceM ? a : m,
    );
    form.push(
      `Längste Fahrt: ${fmtKm(longest.metrics.distanceM)}` +
        (longest.metrics.elevGain ? `, ${n0(longest.metrics.elevGain)} hm` : "") +
        ` (${fmtDateShort(longest.startTime)})`,
    );

    const np = avg(recent.map((a) => a.metrics.np));
    if (np !== undefined) form.push(`Ø Normalized Power: ${n0(np)} W`);
    const iff = avg(recent.map((a) => a.metrics.if));
    if (iff !== undefined) form.push(`Ø Intensity Factor: ${n2(iff)}`);
    const wkgNp = avg(recent.map((a) => a.metrics.wPerKgNp));
    if (wkgNp !== undefined) form.push(`Ø W/kg (NP): ${n1(wkgNp)}`);
    const dec = avg(recent.map((a) => a.metrics.decoupling));
    if (dec !== undefined)
      form.push(`Ø Decoupling: ${n1(dec)} % (aerobe Ausdauer${dec >= 8 ? ", eher dünn" : dec <= 5 ? ", solide" : ""})`);
    const intens = avg(recent.map((a) => a.metrics.intensity));
    if (intens !== undefined) form.push(`Ø Intensität: ${n1(intens)}/10`);

    const climb = hardestClimb(recent.flatMap((a) => a.phases));
    if (climb) form.push(`Längster Anstieg zuletzt: ${climb.label}`);

    lines.push("", "AKTUELLE FORM (letzte ~6 Wochen)", ...form);
  } else {
    lines.push("", "AKTUELLE FORM: keine Fahrten der letzten ~6 Wochen gespeichert.");
  }

  return lines.join("\n");
}
