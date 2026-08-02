import type { Phase, Profile, Sample } from "../model";

/**
 * Erkennt Antritte (Leistungsspitzen) und Anstiege aus der (heruntergerechneten)
 * Zeitreihe. Bewusst konservativ, um Fehlalarme zu vermeiden.
 */
export function detectPhases(samples: Sample[], profile: Profile): Phase[] {
  const phases: Phase[] = [];
  if (samples.length < 3) return phases;

  // ---- Anstiege über Höhe/Distanz ----
  const hasAlt = samples.some((s) => s.altitude !== undefined);
  const hasDist = samples.some((s) => s.distance !== undefined);
  if (hasAlt && hasDist) {
    let i = 0;
    while (i < samples.length - 1) {
      const start = i;
      let gain = 0;
      let dist = 0;
      let j = i;
      while (j < samples.length - 1) {
        const a = samples[j];
        const b = samples[j + 1];
        const dAlt = (b.altitude ?? a.altitude ?? 0) - (a.altitude ?? 0);
        const dDist = (b.distance ?? a.distance ?? 0) - (a.distance ?? 0);
        if (dAlt <= -3 && dist > 0) break; // deutliches Gefälle beendet den Anstieg
        gain += Math.max(0, dAlt);
        dist += Math.max(0, dDist);
        j++;
        if (dDist < 0) break;
      }
      const grade = dist > 0 ? (gain / dist) * 100 : 0;
      if (gain >= 30 && dist >= 500 && grade >= 2.5) {
        phases.push({
          startT: samples[start].t,
          endT: samples[Math.min(j, samples.length - 1)].t,
          kind: "climb",
          label: `Anstieg ${Math.round(gain)} hm · ${grade.toFixed(1)} %`,
        });
        i = j;
      } else {
        i++;
      }
    }
  }

  // ---- Antritte über Leistung ----
  if (profile.ftp && samples.some((s) => s.power !== undefined)) {
    const thr = profile.ftp * 1.2;
    let i = 0;
    while (i < samples.length) {
      if ((samples[i].power ?? 0) > thr) {
        const start = i;
        let peak = 0;
        while (i < samples.length && (samples[i].power ?? 0) > profile.ftp) {
          peak = Math.max(peak, samples[i].power ?? 0);
          i++;
        }
        const dur = samples[Math.min(i, samples.length - 1)].t - samples[start].t;
        if (dur >= 15) {
          phases.push({
            startT: samples[start].t,
            endT: samples[Math.min(i, samples.length - 1)].t,
            kind: "surge",
            label: `Antritt ${Math.round(peak)} W`,
          });
        }
      } else i++;
    }
  }

  phases.sort((a, b) => a.startT - b.startT);
  return phases;
}

/** Härtester Anstieg (für Feedbacktext). */
export function hardestClimb(phases: Phase[]): Phase | undefined {
  return phases
    .filter((p) => p.kind === "climb")
    .sort((a, b) => b.endT - b.startT - (a.endT - a.startT))[0];
}
