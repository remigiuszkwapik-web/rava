import FitParser from "fit-file-parser";
import type { ParsedActivity, Sample, Sport } from "../model";

function mapSport(raw: unknown): Sport {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("run")) return "running";
  if (s.includes("cycl") || s.includes("bike") || s.includes("ride"))
    return "cycling";
  return "other";
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export async function parseFit(
  bytes: ArrayBuffer,
  fallbackName?: string,
): Promise<ParsedActivity> {
  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "both",
  });

  const data: any = await new Promise((resolve, reject) => {
    parser.parse(bytes, (err, d) => (err ? reject(new Error(err)) : resolve(d)));
  });

  const records: any[] = data?.records ?? [];
  if (!records.length) throw new Error("FIT ohne Datensätze.");

  const firstTs = records.find((r) => r.timestamp)?.timestamp;
  const startMs = firstTs ? new Date(firstTs).getTime() : Date.now();

  let hasGps = false;
  const samples: Sample[] = [];
  for (const r of records) {
    if (!r.timestamp) continue;
    const t = (new Date(r.timestamp).getTime() - startMs) / 1000;
    if (t < 0) continue;
    const lat = num(r.position_lat);
    const lng = num(r.position_long);
    if (lat !== undefined && lng !== undefined) hasGps = true;
    samples.push({
      t,
      power: num(r.power),
      hr: num(r.heart_rate),
      cadence: num(r.cadence),
      speed: num(r.speed) ?? num(r.enhanced_speed),
      altitude: num(r.enhanced_altitude) ?? num(r.altitude),
      distance: num(r.distance),
      lat,
      lng,
      temp: num(r.temperature),
    });
  }
  if (!samples.length) throw new Error("FIT ohne verwertbare Punkte.");

  const session = data?.sessions?.[0];
  const sport = mapSport(session?.sport ?? data?.activity?.sport);
  const name =
    session?.name ||
    fallbackName ||
    new Date(startMs).toLocaleString("de-DE");

  return { sport, startTime: startMs, name, samples, hasGps, source: "fit" };
}
