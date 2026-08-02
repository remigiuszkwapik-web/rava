import type { ParsedActivity, Sport } from "../model";
import { gunzip, isGzip, isZip, textOf, unzipEntries } from "./archive";
import { parseFit } from "./fit";
import { parseGpxOrTcx } from "./gpxtcx";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function looksLikeFit(bytes: Uint8Array): boolean {
  // FIT-Header: Bytes 8..11 = ".FIT"
  return (
    bytes.length > 12 &&
    bytes[8] === 0x2e &&
    bytes[9] === 0x46 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x54
  );
}

function looksLikeXml(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 || bytes[i] === 0xef || bytes[i] === 0xbb || bytes[i] === 0xbf)) {
    i++;
  }
  return bytes[i] === 0x3c; // '<'
}

export async function parseBytes(
  name: string,
  bytes: Uint8Array,
): Promise<ParsedActivity> {
  const lower = name.toLowerCase();

  if (lower.endsWith(".gz") || isGzip(bytes)) {
    const inner = gunzip(bytes);
    const innerName = lower.endsWith(".gz") ? name.slice(0, -3) : name;
    return parseBytes(innerName, inner);
  }

  if (lower.endsWith(".fit") || looksLikeFit(bytes)) {
    return parseFit(toArrayBuffer(bytes), basename(name));
  }

  if (lower.endsWith(".gpx") || lower.endsWith(".tcx") || looksLikeXml(bytes)) {
    return parseGpxOrTcx(textOf(bytes), basename(name));
  }

  throw new Error(`Unbekanntes Dateiformat: ${basename(name)}`);
}

// ---- Strava-Metadaten (activities.csv) ----
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

interface CsvMeta {
  name?: string;
  sport?: Sport;
}

function mapCsvSport(t: string): Sport | undefined {
  const s = t.toLowerCase();
  if (s.includes("run")) return "running";
  if (s.includes("ride") || s.includes("cycl") || s.includes("bike"))
    return "cycling";
  return undefined;
}

function parseStravaCsv(text: string): Map<string, CsvMeta> {
  const map = new Map<string, CsvMeta>();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return map;
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const iFile = header.findIndex((h) => h.includes("filename"));
  const iName = header.findIndex((h) => h.includes("activity name"));
  const iType = header.findIndex((h) => h.includes("activity type"));
  if (iFile < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const file = cols[iFile]?.trim();
    if (!file) continue;
    map.set(basename(file), {
      name: iName >= 0 ? cols[iName]?.trim() : undefined,
      sport: iType >= 0 ? mapCsvSport(cols[iType] ?? "") : undefined,
    });
  }
  return map;
}

const ACTIVITY_EXT = /\.(fit|gpx|tcx)(\.gz)?$/i;

export interface BulkResult {
  activities: ParsedActivity[];
  failed: number;
}

/** Strava-Export-ZIP (oder beliebiges ZIP mit Aktivitätsdateien) parsen. */
export async function parseZip(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const files = await unzipEntries(bytes);

  let csv: Map<string, CsvMeta> = new Map();
  const csvKey = Object.keys(files).find((k) =>
    k.toLowerCase().endsWith("activities.csv"),
  );
  if (csvKey) {
    try {
      csv = parseStravaCsv(textOf(files[csvKey]));
    } catch {
      /* Metadaten optional */
    }
  }

  const entries = Object.keys(files).filter((k) => ACTIVITY_EXT.test(k));
  const activities: ParsedActivity[] = [];
  let failed = 0;
  let done = 0;
  for (const key of entries) {
    try {
      const parsed = await parseBytes(key, files[key]);
      const meta = csv.get(basename(key));
      if (meta?.name) parsed.name = meta.name;
      if (meta?.sport) parsed.sport = meta.sport;
      activities.push(parsed);
    } catch {
      failed++;
    }
    done++;
    onProgress?.(done, entries.length);
    // Event-Loop atmen lassen, damit die UI aktualisiert
    if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return { activities, failed };
}

/** Eine Nutzerdatei → eine oder mehrere ParsedActivities (ZIP → viele). */
export async function parseFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".zip") || isZip(bytes)) {
    return parseZip(bytes, onProgress);
  }
  const parsed = await parseBytes(file.name, bytes);
  return { activities: [parsed], failed: 0 };
}
