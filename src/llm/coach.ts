import type { Activity, Profile, ZoneModel } from "../model";
import { fmtDuration } from "../format";

const SYSTEM_PROMPT = `Du bist mein persönlicher Ausdaueranalyst – wie Strava, nur direkter. Ich gebe dir die bereits berechneten Kennzahlen einer Rad- oder Laufeinheit. Erfinde keine Zahlen und rechne nichts dazu, was nicht in den Daten steht – nutze nur die gelieferten Werte. Fehlende Werte einfach weglassen, nicht nachfragen.

Gib jedes Mal ein einheitlich aufgebautes Feedback in genau dieser Struktur (deutsch, kompakt, keine Floskeln, Zahlen vor Bauchgefühl, motivierend aber ehrlich):

1. Fazit in einem Satz + Intensitäts-Rating 1–10.
2. Analyse: Intensität & Zonenverteilung; Leistungsanalyse (NP vs. Ø, Variabilität, W/kg an Anstiegen); Pacing (erste vs. zweite Hälfte); Anstiege; Herz-Kreislauf (Decoupling, Effizienz).
3. Was heraussticht: Positives und Dinge zum Draufschauen.
4. Vergleich (nur wenn Vergleichsdaten mitgegeben werden).
5. Empfehlung: was die Einheit übers Training sagt, wie viel Erholung sinnvoll ist, konkrete Idee für die nächste Fahrt.

Ton: erfahrener Coach, der die Zahlen liest und nichts schönredet.`;

function zoneSummary(z?: ZoneModel): Record<string, number> | undefined {
  if (!z) return undefined;
  const out: Record<string, number> = {};
  z.labels.forEach((l, i) => {
    if (z.seconds[i]) out[l] = Math.round(z.seconds[i]);
  });
  return out;
}

function payload(a: Activity, profile: Profile, prev?: Activity) {
  const m = a.metrics;
  return {
    athlet: {
      ftp: profile.ftp,
      gewicht_kg: profile.weightKg,
      max_hf: profile.maxHr,
      schwellen_hf: profile.thresholdHr,
    },
    einheit: {
      sportart: a.sport,
      name: a.name,
      datum: new Date(a.startTime).toISOString(),
      fahrzeit: fmtDuration(m.durationMovingS),
      gesamtzeit: fmtDuration(m.durationTotalS),
      distanz_km: +(m.distanceM / 1000).toFixed(2),
      hoehenmeter: m.elevGain,
      oe_tempo_kmh: m.avgSpeed ? +(m.avgSpeed * 3.6).toFixed(1) : undefined,
      max_tempo_kmh: m.maxSpeed ? +(m.maxSpeed * 3.6).toFixed(1) : undefined,
      oe_leistung_w: m.avgPower,
      max_leistung_w: m.maxPower,
      np_w: m.np,
      if: m.if,
      tss: m.tss,
      vi: m.vi,
      w_pro_kg_np: m.wPerKgNp,
      oe_hf: m.avgHr,
      max_hf: m.maxHr,
      oe_trittfrequenz: m.avgCadence,
      kcal: m.kcal,
      temperatur_c: m.tempAvg,
      decoupling_prozent: m.decoupling,
      intensitaet_1_10: m.intensity,
      leistungszonen_sek: zoneSummary(m.powerZones),
      hf_zonen_sek: zoneSummary(m.hrZones),
      phasen: a.phases.map((p) => ({
        art: p.kind,
        label: p.label,
        von_s: Math.round(p.startT),
        bis_s: Math.round(p.endT),
      })),
      kontext: a.context,
      fehlende_daten: m.missing,
    },
    vergleich: prev
      ? {
          name: prev.name,
          distanz_km: +(prev.metrics.distanceM / 1000).toFixed(2),
          np_w: prev.metrics.np,
          tss: prev.metrics.tss,
          if: prev.metrics.if,
          oe_hf: prev.metrics.avgHr,
        }
      : undefined,
  };
}

export interface CoachOpts {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

/** Ruft Claude direkt aus dem Browser auf (eigener API-Key). */
export async function coachComment(
  a: Activity,
  profile: Profile,
  prev: Activity | undefined,
  opts: CoachOpts,
): Promise<string> {
  const body = {
    model: opts.model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Hier sind die berechneten Kennzahlen (JSON). Erstelle das Feedback:\n\n" +
          JSON.stringify(payload(a, profile, prev), null, 2),
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message ? ` – ${j.error.message}` : "";
    } catch {
      /* ignore */
    }
    throw new Error(`Anthropic-API ${res.status}${detail}`);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error("Anfrage wurde vom Modell abgelehnt.");
  }
  const text = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return text || "(Keine Antwort erhalten.)";
}
