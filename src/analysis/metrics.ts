import type {
  Metrics,
  ParsedActivity,
  Profile,
  Sample,
  ZoneModel,
} from "../model";

const MOVING_SPEED = 0.8; // m/s

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export interface Resampled {
  n: number;
  power: (number | undefined)[];
  hr: (number | undefined)[];
  cad: (number | undefined)[];
  speed: (number | undefined)[];
  alt: (number | undefined)[];
  hasPower: boolean;
  hasHr: boolean;
  hasSpeed: boolean;
}

/** Auf 1-Hz-Raster bringen (stufig: letzter Wert ≤ Sekunde). */
export function resample(samples: Sample[], maxT: number): Resampled {
  const n = Math.max(1, Math.floor(maxT) + 1);
  const power = new Array<number | undefined>(n);
  const hr = new Array<number | undefined>(n);
  const cad = new Array<number | undefined>(n);
  const speed = new Array<number | undefined>(n);
  const alt = new Array<number | undefined>(n);
  let j = 0;
  let cur: Sample | undefined;
  for (let s = 0; s < n; s++) {
    while (j < samples.length && samples[j].t <= s) {
      cur = samples[j];
      j++;
    }
    power[s] = cur?.power;
    hr[s] = cur?.hr;
    cad[s] = cur?.cadence;
    speed[s] = cur?.speed;
    alt[s] = cur?.altitude;
  }
  return {
    n,
    power,
    hr,
    cad,
    speed,
    alt,
    hasPower: samples.some((s) => s.power !== undefined),
    hasHr: samples.some((s) => s.hr !== undefined),
    hasSpeed: samples.some((s) => s.speed !== undefined),
  };
}

function rolling(xs: number[], win: number): number[] {
  const out = new Array<number>(xs.length);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    q.push(xs[i]);
    sum += xs[i];
    if (q.length > win) sum -= q.shift()!;
    out[i] = sum / q.length;
  }
  return out;
}

function normalizedPower(power1hz: number[]): number | undefined {
  if (power1hz.length < 30) {
    const m = mean(power1hz);
    return m > 0 ? m : undefined;
  }
  const r = rolling(power1hz, 30);
  const p4 = mean(r.map((x) => x ** 4));
  return Math.round(Math.pow(p4, 0.25));
}

export function powerZoneModel(ftp: number, power: (number | undefined)[]): ZoneModel {
  const fr = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5, Infinity];
  const labels = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"];
  const bounds = fr.map((f) => (f === Infinity ? Infinity : Math.round(f * ftp)));
  const seconds = new Array(fr.length).fill(0);
  for (const p of power) {
    if (p === undefined) continue;
    for (let z = 0; z < fr.length; z++) {
      if (p <= fr[z] * ftp) {
        seconds[z]++;
        break;
      }
    }
  }
  return { seconds, bounds, labels };
}

/**
 * HF-Zonen. Mit Ruhepuls → %HRR (Karvonen): Grenze = rest + f·(max−rest).
 * Ohne Ruhepuls → Fallback %Maxpuls.
 */
export function hrZoneModel(
  maxHr: number,
  restHr: number | undefined,
  hr: (number | undefined)[],
): ZoneModel {
  const fr = [0.6, 0.7, 0.8, 0.9, 1.01];
  const labels = ["Z1", "Z2", "Z3", "Z4", "Z5"];
  const useHrr = restHr !== undefined && restHr > 0 && restHr < maxHr;
  const bound = (f: number): number =>
    useHrr ? Math.round(restHr! + f * (maxHr - restHr!)) : Math.round(f * maxHr);
  const bounds = fr.map(bound);
  const seconds = new Array(fr.length).fill(0);
  for (const h of hr) {
    if (h === undefined || h <= 0) continue;
    for (let z = 0; z < fr.length; z++) {
      if (h <= bounds[z]) {
        seconds[z]++;
        break;
      }
      if (z === fr.length - 1) seconds[z]++;
    }
  }
  return { seconds, bounds, labels };
}

function elevationGain(alt: (number | undefined)[]): number {
  const clean = alt.filter((a): a is number => a !== undefined);
  if (clean.length < 2) return 0;
  // leichte Glättung gegen GPS-Rauschen
  const win = 5;
  const sm = rolling(clean, win);
  let gain = 0;
  for (let i = 1; i < sm.length; i++) {
    const d = sm[i] - sm[i - 1];
    if (d > 0.2) gain += d;
  }
  return Math.round(gain);
}

function decoupling(
  effort: (number | undefined)[],
  hr: (number | undefined)[],
): number | undefined {
  const n = effort.length;
  if (n < 600) return undefined; // <10 min zu kurz
  const half = Math.floor(n / 2);
  const ratio = (from: number, to: number): number | undefined => {
    const e: number[] = [];
    const h: number[] = [];
    for (let i = from; i < to; i++) {
      if (effort[i] !== undefined && hr[i] !== undefined && hr[i]! > 0) {
        e.push(effort[i]!);
        h.push(hr[i]!);
      }
    }
    if (e.length < 30) return undefined;
    const mh = mean(h);
    return mh > 0 ? mean(e) / mh : undefined;
  };
  const r1 = ratio(0, half);
  const r2 = ratio(half, n);
  if (r1 === undefined || r2 === undefined || r1 === 0) return undefined;
  return Math.round(((r1 - r2) / r1) * 1000) / 10; // %, positiv = HF driftet hoch
}

function intensityRating(m: Partial<Metrics>, rs: Resampled, maxHr?: number): number {
  if (m.if !== undefined) {
    // IF → 1..10
    const v = (m.if - 0.4) * 12 + 1;
    return clamp(Math.round(v), 1, 10);
  }
  if (rs.hasHr && maxHr) {
    const hrs = rs.hr.filter((h): h is number => h !== undefined && h > 0);
    if (hrs.length) {
      const frac = mean(hrs) / maxHr;
      const v = (frac - 0.45) * 18 + 1;
      return clamp(Math.round(v), 1, 10);
    }
  }
  return 4;
}

export function computeMetrics(
  parsed: ParsedActivity,
  profile: Profile,
): Metrics {
  const samples = [...parsed.samples].sort((a, b) => a.t - b.t);
  const maxT = samples.length ? samples[samples.length - 1].t : 0;
  const durationTotalS = Math.round(maxT);
  const rs = resample(samples, maxT);

  const missing: string[] = [];
  if (!rs.hasPower) missing.push("keine Leistungsdaten");
  if (!rs.hasHr) missing.push("keine Herzfrequenz");
  if (!parsed.hasGps) missing.push("kein GPS");

  // Bewegung
  const movingMask = rs.speed.map((s) =>
    rs.hasSpeed ? (s ?? 0) >= MOVING_SPEED : true,
  );
  const durationMovingS = movingMask.filter(Boolean).length;

  // Distanz
  let distanceM = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].distance !== undefined) {
      distanceM = samples[i].distance!;
      break;
    }
  }
  if (distanceM === 0 && rs.hasSpeed) {
    distanceM = rs.speed.reduce<number>((a, s) => a + (s ?? 0), 0);
  }

  // Geschwindigkeit
  const speedVals = rs.speed.filter((s): s is number => s !== undefined);
  const maxSpeed = speedVals.length ? Math.max(...speedVals) : undefined;
  const avgSpeed =
    durationMovingS > 0 && distanceM > 0
      ? distanceM / durationMovingS
      : speedVals.length
        ? mean(speedVals)
        : undefined;

  const elevGain = elevationGain(rs.alt);

  const m: Metrics = {
    durationMovingS,
    durationTotalS,
    distanceM,
    avgSpeed,
    maxSpeed,
    elevGain,
    intensity: 4,
    missing,
  };

  // Leistung
  if (rs.hasPower) {
    const p1 = rs.power.map((p) => p ?? 0);
    m.avgPower = Math.round(mean(p1));
    const rawMax = samples.reduce<number>(
      (a, s) => (s.power !== undefined && s.power > a ? s.power : a),
      0,
    );
    m.maxPower = rawMax || undefined;
    m.np = normalizedPower(p1);
    if (profile.ftp && m.np) {
      m.if = Math.round((m.np / profile.ftp) * 100) / 100;
      m.tss =
        Math.round(
          ((durationTotalS * m.np * m.if) / (profile.ftp * 3600)) * 100,
        );
      m.powerZones = powerZoneModel(profile.ftp, rs.power);
    }
    if (m.avgPower && m.np) m.vi = Math.round((m.np / m.avgPower) * 100) / 100;
    if (profile.weightKg) {
      if (m.avgPower)
        m.wPerKgAvg = Math.round((m.avgPower / profile.weightKg) * 100) / 100;
      if (m.np) m.wPerKgNp = Math.round((m.np / profile.weightKg) * 100) / 100;
    }
    // kcal aus mechanischer Arbeit (kJ ≈ kcal wegen ~24 % Wirkungsgrad)
    m.kcal = Math.round(p1.reduce((a, b) => a + b, 0) / 1000);
  }

  // Herzfrequenz
  if (rs.hasHr) {
    const hrs = rs.hr.filter((h): h is number => h !== undefined && h > 0);
    if (hrs.length) {
      m.avgHr = Math.round(mean(hrs));
      m.maxHr = Math.max(...hrs);
    }
    const maxHrRef = profile.maxHr ?? m.maxHr;
    if (maxHrRef) m.hrZones = hrZoneModel(maxHrRef, profile.restHr, rs.hr);
  }

  // Trittfrequenz (bewegt & > 0)
  const cadVals: number[] = [];
  for (let i = 0; i < rs.n; i++) {
    const c = rs.cad[i];
    if (c !== undefined && c > 0 && movingMask[i]) cadVals.push(c);
  }
  if (cadVals.length) m.avgCadence = Math.round(mean(cadVals));

  // Temperatur
  const temps = samples
    .map((s) => s.temp)
    .filter((t): t is number => t !== undefined);
  if (temps.length) m.tempAvg = Math.round(mean(temps));

  // Decoupling (Pw:HR, sonst Speed:HR)
  const effort = rs.hasPower ? rs.power : rs.hasSpeed ? rs.speed : undefined;
  if (effort && rs.hasHr) m.decoupling = decoupling(effort, rs.hr);

  m.intensity = intensityRating(m, rs, profile.maxHr ?? m.maxHr);
  return m;
}
