// Gemeinsames Datenmodell für Rava.

export type Sport = "cycling" | "running" | "other";
export type SourceKind = "fit" | "gpx" | "tcx" | "strava-zip" | "dropbox";

/** Ein Messpunkt der (heruntergerechneten) Zeitreihe. */
export interface Sample {
  /** Sekunden seit Aktivitätsbeginn. */
  t: number;
  power?: number; // Watt
  hr?: number; // bpm
  cadence?: number; // rpm
  speed?: number; // m/s
  altitude?: number; // m
  distance?: number; // m, kumuliert
  lat?: number;
  lng?: number;
  temp?: number; // °C
  moving?: boolean; // Bewegung erkannt (Geschwindigkeit > Schwelle)
}

/** Ergebnis eines Parsers, noch in voller Auflösung. */
export interface ParsedActivity {
  sport: Sport;
  startTime: number; // epoch ms
  name?: string;
  samples: Sample[];
  hasGps: boolean;
  source: SourceKind;
  /** Zeitstempel des ersten Samples in ms (für Bin-Berechnung). */
}

/** Kontextfragen beim Upload. */
export interface ContextAnswers {
  group?: "solo" | "group";
  type?: "endurance" | "intervals" | "race" | "recovery" | "climb" | "commute" | "other";
  rpe?: number; // 1..10
  weather?: string;
  notes?: string;
}

/** Automatisch erkannte Phase (für Chart-Bänder & Text). */
export interface Phase {
  startT: number;
  endT: number;
  kind: "surge" | "climb" | "drop" | "rotation" | "steady";
  label: string;
}

export interface ZoneModel {
  /** Sekunden pro Zone, Index 0 = Z1. */
  seconds: number[];
  /** Obergrenzen (Watt bzw. bpm) der Zonen, gleiche Länge wie seconds. */
  bounds: number[];
  labels: string[];
}

export interface Metrics {
  durationMovingS: number;
  durationTotalS: number;
  distanceM: number;
  avgSpeed?: number; // m/s (bewegt)
  maxSpeed?: number;
  elevGain?: number;
  avgPower?: number;
  maxPower?: number;
  np?: number;
  if?: number;
  tss?: number;
  vi?: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  kcal?: number;
  tempAvg?: number;
  powerZones?: ZoneModel;
  hrZones?: ZoneModel;
  decoupling?: number; // % Pw:HR-Drift (1. vs 2. Hälfte)
  wPerKgAvg?: number;
  wPerKgNp?: number;
  /** Intensitäts-Rating 1..10 (deterministisch). */
  intensity: number;
  /** Kurze Hinweise auf fehlende Kanäle. */
  missing: string[];
}

export interface Activity {
  id: string;
  profileId: string;
  sport: Sport;
  name: string;
  startTime: number; // epoch ms
  source: SourceKind;
  samples: Sample[]; // ~10-s-Bins
  metrics: Metrics;
  phases: Phase[];
  context?: ContextAnswers;
  hasGps: boolean;
  createdAt: number;
  /** Original-Bytes für erneutes Parsen (optional). */
  raw?: ArrayBuffer;
}

export interface Profile {
  id: string;
  name: string;
  weightKg?: number;
  ftp?: number;
  maxHr?: number;
  restHr?: number;
  thresholdHr?: number;
  age?: number;
  setupNotes?: string;
  createdAt: number;
}

export interface Settings {
  activeProfileId?: string;
  anthropicApiKey?: string;
  coachModel?: string;
  theme?: "dark" | "light";
  dropbox?: {
    appKey?: string; // vom Nutzer angelegte Dropbox-App (client_id)
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // epoch ms
    folder?: string; // gewählter Ordnerpfad ("" = Root)
    cursor?: string; // list_folder cursor (Delta-Baseline)
    lastSync?: number;
  };
}
