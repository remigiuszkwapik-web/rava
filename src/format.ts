// Einheitliche Formatierungen (deutsch).

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function fmtKm(m: number): string {
  return (m / 1000).toFixed(m >= 10000 ? 1 : 2) + " km";
}

export function fmtKmh(ms?: number): string {
  if (ms === undefined) return "–";
  return (ms * 3.6).toFixed(1) + " km/h";
}

export function fmtPaceMinKm(ms?: number): string {
  if (!ms || ms <= 0) return "–";
  const secPerKm = 1000 / ms;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function n0(v?: number): string {
  return v === undefined ? "–" : Math.round(v).toString();
}
export function n1(v?: number): string {
  return v === undefined ? "–" : v.toFixed(1);
}
export function n2(v?: number): string {
  return v === undefined ? "–" : v.toFixed(2);
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function sportLabel(sport: string): string {
  return sport === "cycling" ? "Rad" : sport === "running" ? "Lauf" : "Aktivität";
}
