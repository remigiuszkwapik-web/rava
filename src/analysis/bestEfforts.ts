import type { Activity, Sample } from "../model";
import { resample } from "./metrics";

/**
 * Bestleistungen je Zeitfenster („Best Efforts", Mean-Max-Kurve) und deren
 * Ranking gegen die eigene Historie – analog zu Stravas „beste Leistung über
 * X". Bewusst deterministisch und offline: kein Server, nur die gespeicherten
 * Fahrten des Profils.
 */

/** Standard-Zeitfenster in Sekunden (5 s … 1 Std.). */
export const EFFORT_WINDOWS = [5, 15, 30, 60, 300, 600, 1200, 1800, 3600];

/** Lesbares Label für ein Fenster. `long` für Badge-Text („1 Stunde"). */
export function windowLabel(s: number, long = false): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const min = s / 60;
    if (long) return min === 1 ? "1 Minute" : `${min} Minuten`;
    return `${min} min`;
  }
  const hrs = s / 3600;
  if (long) return hrs === 1 ? "1 Stunde" : `${hrs} Stunden`;
  return hrs === 1 ? "1 Std." : `${hrs} Std.`;
}

/** Fenster → Wert (Watt bzw. m/s). */
type EffortMap = Record<number, number>;

/**
 * Maximales gleitendes Mittel über `win` Sekunden (Mean-Max) via rollender
 * Summe. `undefined`/Lücken werden von `resample` als letzter Wert gehalten.
 */
function meanMax(xs: number[], win: number): number | undefined {
  const n = xs.length;
  if (win > n) return undefined;
  let sum = 0;
  for (let i = 0; i < win; i++) sum += xs[i];
  let best = sum;
  for (let i = win; i < n; i++) {
    sum += xs[i] - xs[i - win];
    if (sum > best) best = sum;
  }
  return best / win;
}

function meanMaxMap(xs: number[], round: boolean): EffortMap {
  const out: EffortMap = {};
  for (const w of EFFORT_WINDOWS) {
    const v = meanMax(xs, w);
    if (v !== undefined) out[w] = round ? Math.round(v) : v;
  }
  return out;
}

/**
 * Bestleistungen je Fenster aus einer Zeitreihe. Auf voller Auflösung
 * (Import) genau; auf 10-s-Bins (Backfill) für lange Fenster ausreichend,
 * für sehr kurze grob.
 */
export function computeBestEfforts(
  samples: Sample[],
  hasPower: boolean,
): { bestPower?: EffortMap; bestSpeed?: EffortMap } {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const maxT = sorted.length ? sorted[sorted.length - 1].t : 0;
  if (maxT < 1) return {};
  const rs = resample(sorted, maxT);
  if (hasPower && rs.hasPower) {
    const p = rs.power.map((x) => x ?? 0);
    return { bestPower: meanMaxMap(p, true) };
  }
  if (rs.hasSpeed) {
    const sp = rs.speed.map((x) => x ?? 0);
    return { bestSpeed: meanMaxMap(sp, false) };
  }
  return {};
}

export interface Efforts {
  kind: "power" | "speed";
  best: EffortMap;
}

/**
 * Bestwerte einer Fahrt – aus den vorberechneten Metriken, sonst als Fallback
 * live aus den (10-s-Bin-)Samples. Nicht persistiert; hält das Ranking auch
 * für vor diesem Feature importierte Fahrten am Leben.
 */
export function effortsOf(a: Activity): Efforts {
  const m = a.metrics;
  if (m.bestPower && Object.keys(m.bestPower).length)
    return { kind: "power", best: m.bestPower };
  if (m.bestSpeed && Object.keys(m.bestSpeed).length)
    return { kind: "speed", best: m.bestSpeed };
  const hasPower = a.samples.some((s) => s.power !== undefined);
  const r = computeBestEfforts(a.samples, hasPower);
  if (r.bestPower) return { kind: "power", best: r.bestPower };
  return { kind: "speed", best: r.bestSpeed ?? {} };
}

export interface Milestone {
  window: number;
  kind: "power" | "speed";
  /** 1 = Bestleistung, 2 = zweithöchste, 3 = dritthöchste. */
  rank: number;
  /** Zumindest Bestleistung des laufenden Jahres (aber nicht Allzeit-Bester). */
  seasonBest: boolean;
  /** Wert der Fahrt in diesem Fenster (W bzw. m/s). */
  value: number;
}

/**
 * Fenster, in denen die Fahrt zu den drei besten des Profils (gleicher Sport)
 * gehört – Datengrundlage für die Medaillen-Badges. Bester Rang und längstes
 * Fenster zuerst.
 */
export function milestonesFor(a: Activity, all: Activity[]): Milestone[] {
  const mine = effortsOf(a);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const peers = all
    .filter((x) => x.id !== a.id && x.sport === a.sport)
    .map((x) => ({ startTime: x.startTime, e: effortsOf(x) }))
    .filter((p) => p.e.kind === mine.kind);

  const out: Milestone[] = [];
  for (const w of EFFORT_WINDOWS) {
    const v = mine.best[w];
    if (v === undefined) continue;
    let higher = 0;
    let higherSeason = 0;
    for (const p of peers) {
      const pv = p.e.best[w];
      if (pv === undefined || pv <= v) continue;
      higher++;
      if (p.startTime >= yearStart) higherSeason++;
    }
    const rank = higher + 1;
    const inSeason = a.startTime >= yearStart;
    if (rank <= 3)
      out.push({
        window: w,
        kind: mine.kind,
        rank,
        seasonBest: inSeason && higherSeason === 0 && rank > 1,
        value: v,
      });
  }
  out.sort((x, y) => x.rank - y.rank || y.window - x.window);
  return out;
}
