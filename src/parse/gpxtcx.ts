import type { ParsedActivity, Sample, Sport } from "../model";

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("XML konnte nicht gelesen werden.");
  }
  return doc;
}

function mapSport(raw: string | null | undefined): Sport {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("run")) return "running";
  if (s.includes("bik") || s.includes("cycl") || s.includes("ride"))
    return "cycling";
  return "other";
}

/** Erste Nachfahren-Element mit passendem localName (namespace-agnostisch). */
function child(el: Element, local: string): Element | undefined {
  for (const c of Array.from(el.children)) {
    if (c.localName === local) return c;
  }
  return undefined;
}
function deep(el: Element, local: string): Element | undefined {
  const list = el.getElementsByTagName("*");
  for (const c of Array.from(list)) {
    if (c.localName === local) return c;
  }
  return undefined;
}
function numText(el: Element | undefined): number | undefined {
  if (!el) return undefined;
  const v = parseFloat(el.textContent ?? "");
  return Number.isFinite(v) ? v : undefined;
}

const R = 6371000;
function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distanz + abgeleitete Geschwindigkeit ergänzen, wo GPS vorhanden ist. */
function deriveDistanceSpeed(samples: Sample[]): void {
  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i > 0) {
      const p = samples[i - 1];
      if (
        s.lat !== undefined &&
        s.lng !== undefined &&
        p.lat !== undefined &&
        p.lng !== undefined
      ) {
        const d = haversine(p.lat, p.lng, s.lat, s.lng);
        dist += d;
        const dt = s.t - p.t;
        if (dt > 0 && s.speed === undefined) s.speed = d / dt;
      }
    }
    if (s.distance === undefined && (s.lat !== undefined || dist > 0)) {
      s.distance = dist;
    }
  }
}

function parseGpx(doc: Document, fallbackName?: string): ParsedActivity {
  const trkpts = Array.from(doc.getElementsByTagName("*")).filter(
    (e) => e.localName === "trkpt",
  );
  if (!trkpts.length) throw new Error("GPX ohne Trackpunkte.");

  const times = trkpts
    .map((p) => child(p, "time")?.textContent)
    .filter(Boolean) as string[];
  const startMs = times.length ? new Date(times[0]).getTime() : Date.now();

  let hasGps = false;
  const samples: Sample[] = [];
  for (const p of trkpts) {
    const lat = parseFloat(p.getAttribute("lat") ?? "");
    const lng = parseFloat(p.getAttribute("lon") ?? "");
    const timeEl = child(p, "time");
    const t = timeEl?.textContent
      ? (new Date(timeEl.textContent).getTime() - startMs) / 1000
      : samples.length; // fallback: 1 Hz
    if (Number.isFinite(lat) && Number.isFinite(lng)) hasGps = true;
    const ext = child(p, "extensions");
    let hr: number | undefined;
    let cad: number | undefined;
    let power: number | undefined;
    let temp: number | undefined;
    if (ext) {
      hr = numText(deep(ext, "hr"));
      cad = numText(deep(ext, "cad"));
      temp = numText(deep(ext, "atemp"));
      power =
        numText(deep(ext, "power")) ??
        numText(deep(ext, "pwr")) ??
        numText(deep(ext, "PowerInWatts"));
    }
    samples.push({
      t,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      altitude: numText(child(p, "ele")),
      hr,
      cadence: cad,
      power,
      temp,
    });
  }
  deriveDistanceSpeed(samples);

  const nameEl =
    Array.from(doc.getElementsByTagName("*")).find(
      (e) => e.localName === "name",
    ) ?? undefined;
  const typeEl = Array.from(doc.getElementsByTagName("*")).find(
    (e) => e.localName === "type",
  );
  return {
    sport: mapSport(typeEl?.textContent ?? nameEl?.textContent),
    startTime: startMs,
    name: nameEl?.textContent || fallbackName || new Date(startMs).toLocaleString("de-DE"),
    samples,
    hasGps,
    source: "gpx",
  };
}

function parseTcx(doc: Document, fallbackName?: string): ParsedActivity {
  const activity = Array.from(doc.getElementsByTagName("*")).find(
    (e) => e.localName === "Activity",
  );
  const sport = mapSport(activity?.getAttribute("Sport"));

  const tps = Array.from(doc.getElementsByTagName("*")).filter(
    (e) => e.localName === "Trackpoint",
  );
  if (!tps.length) throw new Error("TCX ohne Trackpunkte.");

  const firstTime = child(tps[0], "Time")?.textContent;
  const startMs = firstTime ? new Date(firstTime).getTime() : Date.now();

  let hasGps = false;
  const samples: Sample[] = [];
  for (const p of tps) {
    const timeEl = child(p, "Time");
    const t = timeEl?.textContent
      ? (new Date(timeEl.textContent).getTime() - startMs) / 1000
      : samples.length;
    const pos = child(p, "Position");
    const lat = pos ? numText(child(pos, "LatitudeDegrees")) : undefined;
    const lng = pos ? numText(child(pos, "LongitudeDegrees")) : undefined;
    if (lat !== undefined && lng !== undefined) hasGps = true;
    const hrEl = child(p, "HeartRateBpm");
    const hr = hrEl ? numText(child(hrEl, "Value")) : undefined;
    const ext = child(p, "Extensions");
    let power: number | undefined;
    let speed: number | undefined;
    if (ext) {
      power = numText(deep(ext, "Watts"));
      speed = numText(deep(ext, "Speed"));
    }
    samples.push({
      t,
      lat,
      lng,
      altitude: numText(child(p, "AltitudeMeters")),
      distance: numText(child(p, "DistanceMeters")),
      hr,
      cadence: numText(child(p, "Cadence")),
      power,
      speed,
    });
  }
  deriveDistanceSpeed(samples);

  return {
    sport,
    startTime: startMs,
    name: fallbackName || new Date(startMs).toLocaleString("de-DE"),
    samples,
    hasGps,
    source: "tcx",
  };
}

export function parseGpxOrTcx(
  text: string,
  fallbackName?: string,
): ParsedActivity {
  const doc = parseXml(text);
  const root = doc.documentElement?.localName?.toLowerCase();
  if (root === "gpx") return parseGpx(doc, fallbackName);
  if (root === "trainingcenterdatabase") return parseTcx(doc, fallbackName);
  // Heuristik, falls Root untypisch benannt ist
  if (doc.getElementsByTagName("*")[0]) {
    const hasTrkpt = Array.from(doc.getElementsByTagName("*")).some(
      (e) => e.localName === "trkpt",
    );
    if (hasTrkpt) return parseGpx(doc, fallbackName);
    return parseTcx(doc, fallbackName);
  }
  throw new Error("Unbekanntes XML-Format (weder GPX noch TCX).");
}
