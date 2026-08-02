import { fmtDateShort, fmtDuration, fmtKm, n0, n1, n2 } from "../format";
import type { Activity, Profile } from "../model";
import { makeChart } from "./charts";
import { clear, h } from "./dom";

function overlayTimeline(a: Activity, b: Activity, profile: Profile): HTMLCanvasElement {
  return makeChart(200, (ctx, w, hgt) => {
    const padL = 8;
    const padR = 8;
    const padT = 24;
    const padB = 14;
    const maxPow = Math.max(
      profile.ftp ? profile.ftp * 1.25 : 0,
      ...[a, b].flatMap((x) =>
        x.samples.map((s) => s.power ?? 0),
      ),
      1,
    );
    const yP = (p: number) => padT + (1 - p / maxPow) * (hgt - padT - padB);
    const xf = (frac: number) => padL + frac * (w - padL - padR);

    if (profile.ftp) {
      const y = yP(profile.ftp);
      ctx.strokeStyle = "#3FB8AF";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const drawPower = (act: Activity, dash: boolean) => {
      const maxT = act.samples[act.samples.length - 1]?.t || 1;
      ctx.strokeStyle = "#F2A93B";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = dash ? 0.7 : 1;
      ctx.setLineDash(dash ? [5, 4] : []);
      ctx.beginPath();
      let started = false;
      for (const s of act.samples) {
        if (s.power === undefined) continue;
        const px = xf(s.t / maxT);
        const py = yP(s.power);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    drawPower(a, false);
    drawPower(b, true);

    ctx.fillStyle = "#8B97A7";
    ctx.font = "10px system-ui";
    ctx.fillText("A: " + a.name, padL, 11);
    ctx.fillText("B: " + b.name + " (gestrichelt)", padL, 22);
  });
}

function cmpTable(a: Activity, b: Activity): HTMLElement {
  const rows: Array<[string, string, string]> = [
    ["Datum", fmtDateShort(a.startTime), fmtDateShort(b.startTime)],
    ["Distanz", fmtKm(a.metrics.distanceM), fmtKm(b.metrics.distanceM)],
    ["Fahrzeit", fmtDuration(a.metrics.durationMovingS), fmtDuration(b.metrics.durationMovingS)],
    ["Höhenm.", n0(a.metrics.elevGain) + " hm", n0(b.metrics.elevGain) + " hm"],
    ["Ø Leistung", n0(a.metrics.avgPower) + " W", n0(b.metrics.avgPower) + " W"],
    ["NP", n0(a.metrics.np) + " W", n0(b.metrics.np) + " W"],
    ["IF", n2(a.metrics.if), n2(b.metrics.if)],
    ["TSS", n0(a.metrics.tss), n0(b.metrics.tss)],
    ["Ø Puls", n0(a.metrics.avgHr) + " bpm", n0(b.metrics.avgHr) + " bpm"],
    ["W/kg (NP)", n1(a.metrics.wPerKgNp), n1(b.metrics.wPerKgNp)],
    ["Decoupling", n1(a.metrics.decoupling) + " %", n1(b.metrics.decoupling) + " %"],
  ];
  const table = h("table", { style: { width: "100%", borderCollapse: "collapse" } });
  table.append(
    h(
      "tr",
      {},
      h("td", { class: "muted" }, ""),
      h("td", { class: "num", style: { textAlign: "right", fontWeight: "700" } }, "A"),
      h("td", { class: "num", style: { textAlign: "right", fontWeight: "700" } }, "B"),
    ),
  );
  for (const [k, va, vb] of rows) {
    table.append(
      h(
        "tr",
        {},
        h("td", { class: "muted" }, k),
        h("td", { class: "num", style: { textAlign: "right" } }, va),
        h("td", { class: "num", style: { textAlign: "right" } }, vb),
      ),
    );
  }
  return table;
}

export function compareView(activities: Activity[], profile: Profile): HTMLElement {
  if (activities.length < 2) {
    return h(
      "div",
      { class: "empty" },
      h("p", {}, "Mindestens zwei Aktivitäten für einen Vergleich nötig."),
    );
  }

  let ai = 0;
  let bi = 1;
  const body = h("div", {});

  const opt = (sel: number) =>
    activities.map((a, i) =>
      h(
        "option",
        { value: String(i), selected: i === sel },
        `${fmtDateShort(a.startTime)} · ${a.name}`,
      ),
    );

  const selA = h("select", {}, ...opt(ai));
  const selB = h("select", {}, ...opt(bi));

  const render = () => {
    clear(body);
    const a = activities[ai];
    const b = activities[bi];
    body.append(
      h("div", { class: "panel" }, h("h2", {}, "Verlauf (überlagert)"), overlayTimeline(a, b, profile)),
      h("div", { class: "panel feedback" }, h("h2", {}, "Kennzahlen"), cmpTable(a, b)),
    );
  };

  selA.addEventListener("change", () => {
    ai = Number(selA.value);
    render();
  });
  selB.addEventListener("change", () => {
    bi = Number(selB.value);
    render();
  });

  render();
  return h(
    "div",
    {},
    h(
      "div",
      { class: "panel" },
      h("div", { class: "row" }, h("div", {}, h("label", {}, "A"), selA), h("div", {}, h("label", {}, "B"), selB)),
    ),
    body,
  );
}
