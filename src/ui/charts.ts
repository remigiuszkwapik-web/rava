import type { Activity, Profile, ZoneModel } from "../model";
import { fmtDuration } from "../format";
import { h } from "./dom";

const COL = {
  bg: "#0E1116",
  panel: "#151B23",
  line: "#232C38",
  text: "#E6EDF3",
  muted: "#8B97A7",
  power: "#F2A93B",
  hr: "#E5484D",
  draft: "#3FB8AF",
};
const POWER_ZONE_COLORS = [
  "#3a6ea5",
  "#3fb8af",
  "#57c25b",
  "#d7c04a",
  "#f2a93b",
  "#ef7d43",
  "#e5484d",
];
const HR_ZONE_COLORS = ["#3a6ea5", "#3fb8af", "#57c25b", "#f2a93b", "#e5484d"];

type Draw = (ctx: CanvasRenderingContext2D, w: number, hgt: number) => void;

/** Canvas, das sich an die Elternbreite anpasst (dpr-scharf, Re-Render bei resize). */
export function makeChart(cssHeight: number, draw: Draw): HTMLCanvasElement {
  const canvas = h("canvas");
  canvas.style.height = cssHeight + "px";
  const render = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
    if (w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cssHeight);
    draw(ctx, w, cssHeight);
  };
  const ro = new ResizeObserver(() => render());
  requestAnimationFrame(() => {
    ro.observe(canvas);
    render();
  });
  window.addEventListener("resize", render);
  window.addEventListener("load", render);
  return canvas;
}

function smooth(vals: (number | undefined)[], win: number): (number | undefined)[] {
  const out = new Array<number | undefined>(vals.length);
  for (let i = 0; i < vals.length; i++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(vals.length - 1, i + win); j++) {
      if (vals[j] !== undefined) {
        sum += vals[j]!;
        cnt++;
      }
    }
    out[i] = cnt ? sum / cnt : undefined;
  }
  return out;
}

// ---- Verlauf: Leistung + Puls über Zeit ----
export function drawTimeline(a: Activity, profile: Profile): HTMLCanvasElement {
  return makeChart(200, (ctx, w, hgt) => {
    const padL = 8;
    const padR = 8;
    const padT = 26;
    const padB = 18;
    const s = a.samples;
    if (s.length < 2) {
      ctx.fillStyle = COL.muted;
      ctx.font = "13px system-ui";
      ctx.fillText("Zu wenige Daten für den Verlauf.", padL, hgt / 2);
      return;
    }
    const maxT = s[s.length - 1].t || 1;
    const x = (t: number) => padL + (t / maxT) * (w - padL - padR);

    const hasPower = s.some((p) => p.power !== undefined);
    const hasHr = s.some((p) => p.hr !== undefined);

    const powerVals = smooth(s.map((p) => p.power), 1);
    const maxPow = Math.max(
      profile.ftp ? profile.ftp * 1.25 : 0,
      ...powerVals.filter((v): v is number => v !== undefined),
      1,
    );
    const yP = (p: number) => padT + (1 - p / maxPow) * (hgt - padT - padB);

    const hrVals = s.map((p) => p.hr);
    const hrDef = hrVals.filter((v): v is number => v !== undefined);
    const minH = hrDef.length ? Math.min(...hrDef) - 5 : 0;
    const maxH = hrDef.length ? Math.max(...hrDef) + 5 : 1;
    const yH = (v: number) => padT + (1 - (v - minH) / (maxH - minH)) * (hgt - padT - padB);

    // Phasen-Bänder
    for (const ph of a.phases) {
      const x0 = x(ph.startT);
      const x1 = Math.max(x0 + 2, x(ph.endT));
      ctx.fillStyle =
        ph.kind === "surge"
          ? "rgba(242,169,59,0.14)"
          : ph.kind === "climb"
            ? "rgba(63,184,175,0.14)"
            : "rgba(229,72,77,0.14)";
      ctx.fillRect(x0, padT, x1 - x0, hgt - padT - padB);
      ctx.fillStyle = COL.muted;
      ctx.font = "10px system-ui";
      ctx.fillText(ph.label, x0 + 3, padT + 11);
    }

    // FTP-Linie
    if (profile.ftp) {
      const y = yP(profile.ftp);
      ctx.strokeStyle = COL.draft;
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.draft;
      ctx.font = "10px system-ui";
      ctx.fillText("FTP " + profile.ftp + " W", padL + 2, y - 3);
    }

    // Leistung
    if (hasPower) {
      ctx.strokeStyle = COL.power;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.length; i++) {
        const v = powerVals[i];
        if (v === undefined) continue;
        const px = x(s[i].t);
        const py = yP(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Puls
    if (hasHr) {
      ctx.strokeStyle = COL.hr;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.length; i++) {
        const v = hrVals[i];
        if (v === undefined) continue;
        const px = x(s[i].t);
        const py = yH(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Zeitachse
    ctx.fillStyle = COL.muted;
    ctx.font = "10px system-ui";
    ctx.fillText("0", padL, hgt - 5);
    const midLbl = fmtDuration(maxT);
    ctx.fillText(midLbl, w - padR - ctx.measureText(midLbl).width, hgt - 5);
  });
}

// ---- Zonen-Balken ----
function zoneBars(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  hgt: number,
  z: ZoneModel,
  colors: string[],
  title: string,
): void {
  ctx.fillStyle = COL.muted;
  ctx.font = "11px system-ui";
  ctx.fillText(title, x0, y0 - 8);
  const total = z.seconds.reduce((a, b) => a + b, 0) || 1;
  const n = z.seconds.length;
  const gap = 4;
  const bw = (w - gap * (n - 1)) / n;
  const maxSec = Math.max(...z.seconds, 1);
  for (let i = 0; i < n; i++) {
    const bh = (z.seconds[i] / maxSec) * hgt;
    const bx = x0 + i * (bw + gap);
    ctx.fillStyle = colors[i] ?? COL.line;
    ctx.fillRect(bx, y0 + (hgt - bh), bw, bh);
    // Prozent über dem Balken
    const pct = Math.round((z.seconds[i] / total) * 100);
    ctx.fillStyle = COL.muted;
    ctx.font = "9px system-ui";
    if (pct > 0) {
      const lbl = pct + "%";
      ctx.fillText(
        lbl,
        bx + (bw - ctx.measureText(lbl).width) / 2,
        y0 + hgt - bh - 3,
      );
    }
    // Zonen-Kürzel unter dem Balken
    ctx.font = "10px system-ui";
    ctx.fillText(
      z.labels[i],
      bx + (bw - ctx.measureText(z.labels[i]).width) / 2,
      y0 + hgt + 13,
    );
  }
}

export function drawZones(a: Activity): HTMLCanvasElement | null {
  const pz = a.metrics.powerZones;
  const hz = a.metrics.hrZones;
  if (!pz && !hz) return null;
  return makeChart(128, (ctx, w) => {
    const cols = pz && hz ? 2 : 1;
    const cw = (w - (cols - 1) * 16) / cols;
    let x = 0;
    if (pz) {
      zoneBars(ctx, x, 30, cw, 78, pz, POWER_ZONE_COLORS, "Leistungszonen");
      x += cw + 16;
    }
    if (hz) zoneBars(ctx, x, 30, cw, 78, hz, HR_ZONE_COLORS, "HF-Zonen");
  });
}

// ---- Route (offline-Polyline, Höhen-Einfärbung) ----
export function drawRoute(a: Activity): HTMLCanvasElement | null {
  const pts = a.samples.filter(
    (s) => s.lat !== undefined && s.lng !== undefined,
  );
  if (pts.length < 2) return null;
  return makeChart(200, (ctx, w, hgt) => {
    const pad = 10;
    const lats = pts.map((p) => p.lat!);
    const lngs = pts.map((p) => p.lng!);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const midLat = (minLat + maxLat) / 2;
    const cos = Math.cos((midLat * Math.PI) / 180) || 1;
    const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((w - 2 * pad) / spanX, (hgt - 2 * pad) / spanY);
    const offX = (w - spanX * scale) / 2;
    const offY = (hgt - spanY * scale) / 2;
    const px = (lng: number) => offX + (lng - minLng) * cos * scale;
    const py = (lat: number) => offY + (maxLat - lat) * scale;

    const alts = pts
      .map((p) => p.altitude)
      .filter((v): v is number => v !== undefined);
    const minA = alts.length ? Math.min(...alts) : 0;
    const maxA = alts.length ? Math.max(...alts) : 1;
    const altColor = (v?: number) => {
      if (v === undefined || maxA === minA) return COL.draft;
      const t = (v - minA) / (maxA - minA);
      const r = Math.round(63 + t * (229 - 63));
      const g = Math.round(184 + t * (72 - 184));
      const b = Math.round(175 + t * (77 - 175));
      return `rgb(${r},${g},${b})`;
    };

    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = altColor(pts[i].altitude);
      ctx.beginPath();
      ctx.moveTo(px(pts[i - 1].lng!), py(pts[i - 1].lat!));
      ctx.lineTo(px(pts[i].lng!), py(pts[i].lat!));
      ctx.stroke();
    }
    // Start/Ziel
    ctx.fillStyle = COL.draft;
    ctx.beginPath();
    ctx.arc(px(pts[0].lng!), py(pts[0].lat!), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.power;
    ctx.beginPath();
    ctx.arc(px(pts[pts.length - 1].lng!), py(pts[pts.length - 1].lat!), 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
