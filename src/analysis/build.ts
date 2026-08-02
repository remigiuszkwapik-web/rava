import type {
  Activity,
  ContextAnswers,
  ParsedActivity,
  Profile,
  Sample,
  SourceKind,
} from "../model";
import { uid } from "../state/profile";
import { computeMetrics } from "./metrics";
import { detectPhases } from "./segments";

const BIN_S = 10;

function avgDefined(vals: (number | undefined)[]): number | undefined {
  const xs = vals.filter((v): v is number => v !== undefined);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}
function lastDefined(vals: (number | undefined)[]): number | undefined {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== undefined) return vals[i];
  return undefined;
}

/** Zeitreihe auf ~BIN_S-Bins runterrechnen (für Charts & Phasen). */
export function downsample(samples: Sample[], binS = BIN_S): Sample[] {
  if (!samples.length) return [];
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const bins = new Map<number, Sample[]>();
  for (const s of sorted) {
    const k = Math.floor(s.t / binS);
    const arr = bins.get(k);
    if (arr) arr.push(s);
    else bins.set(k, [s]);
  }
  const out: Sample[] = [];
  for (const k of [...bins.keys()].sort((a, b) => a - b)) {
    const g = bins.get(k)!;
    out.push({
      t: k * binS,
      power: avgDefined(g.map((s) => s.power)),
      hr: avgDefined(g.map((s) => s.hr)),
      cadence: avgDefined(g.map((s) => s.cadence)),
      speed: avgDefined(g.map((s) => s.speed)),
      altitude: lastDefined(g.map((s) => s.altitude)),
      distance: lastDefined(g.map((s) => s.distance)),
      lat: lastDefined(g.map((s) => s.lat)),
      lng: lastDefined(g.map((s) => s.lng)),
      temp: avgDefined(g.map((s) => s.temp)),
    });
  }
  return out;
}

export interface BuildOpts {
  context?: ContextAnswers;
  source?: SourceKind;
  keepRaw?: ArrayBuffer;
}

export function buildActivity(
  parsed: ParsedActivity,
  profile: Profile,
  opts: BuildOpts = {},
): Activity {
  const metrics = computeMetrics(parsed, profile);
  const ds = downsample(parsed.samples);
  const phases = detectPhases(ds, profile);
  return {
    id: uid(),
    profileId: profile.id,
    sport: parsed.sport,
    name: parsed.name ?? new Date(parsed.startTime).toLocaleString("de-DE"),
    startTime: parsed.startTime,
    source: opts.source ?? parsed.source,
    samples: ds,
    metrics,
    phases,
    context: opts.context,
    hasGps: parsed.hasGps,
    createdAt: Date.now(),
    raw: opts.keepRaw,
  };
}
