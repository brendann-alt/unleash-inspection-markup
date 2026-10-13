/**
 * Canvas drawing shared by the live overlay and the evidence burn-in.
 * Same visual language as SwiftScope: dot + label tag for points, line with
 * arrow and length label for runs, translucent fill for zones.
 */
import type { Pt } from "./types";

export interface DrawOpts {
  colour: string;
  label?: string;
  measure?: string;
  /** Scale for line widths / fonts. 1 on screen, larger on full-res frames. */
  scale?: number;
  dashed?: boolean;
}

/** Map normalised points into a W x H canvas. */
export function project(pts: Pt[], w: number, h: number) {
  return pts.map((p) => ({ x: p.x * w, y: p.y * h }));
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, fg = "#fff") {
  const fs = Math.round(12 * s);
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const pad = 6 * s;
  const tw = Math.min(ctx.measureText(text).width, 260 * s);
  ctx.fillStyle = "rgba(0,0,0,.75)";
  ctx.fillRect(x, y - fs / 2 - pad / 2, tw + pad * 2, fs + pad);
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + pad, y, tw);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export function drawShape(ctx: CanvasRenderingContext2D, px: { x: number; y: number }[], o: DrawOpts) {
  const s = o.scale ?? 1;
  ctx.save();
  ctx.strokeStyle = o.colour;
  ctx.fillStyle = o.colour;
  ctx.lineWidth = 3 * s;
  ctx.setLineDash(o.dashed ? [6 * s, 4 * s] : []);
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 4 * s;

  if (px.length === 1) {
    ctx.beginPath();
    ctx.arc(px[0].x, px[0].y, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();
    if (o.label) tag(ctx, o.label, px[0].x + 14 * s, px[0].y, s);
  } else if (px.length === 2) {
    const [a, b] = px;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.shadowBlur = 0;
    for (const p of px) { ctx.beginPath(); ctx.arc(p.x, p.y, 6 * s, 0, Math.PI * 2); ctx.fill(); }
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const al = 16 * s;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - al * Math.cos(ang - 0.4), b.y - al * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - al * Math.cos(ang + 0.4), b.y - al * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const text = [o.label, o.measure].filter(Boolean).join(" · ");
    if (text) tag(ctx, text, mx + 8 * s, my - 14 * s, s);
  } else if (px.length >= 3) {
    ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y);
    px.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.globalAlpha = 0.22; ctx.fill();
    ctx.globalAlpha = 1; ctx.stroke();
    const cx = px.reduce((t, p) => t + p.x, 0) / px.length;
    const cy = px.reduce((t, p) => t + p.y, 0) / px.length;
    const text = [o.label, o.measure].filter(Boolean).join(" · ");
    if (text) tag(ctx, text, cx, cy, s);
  }
  ctx.restore();
}

/** Open polyline while tracing (not closed). */
export function drawTrace(ctx: CanvasRenderingContext2D, px: { x: number; y: number }[], colour: string) {
  if (px.length < 2) return;
  ctx.save();
  ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y);
  px.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  ctx.restore();
}

export function drawHint(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  tag(ctx, text, x - 60, y - 30, 1);
}

/** Simplify a traced freehand path so polygons stay small (radial distance). */
export function simplify(pts: Pt[], minDist = 0.006): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (const p of pts.slice(1)) {
    const l = out[out.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) >= minDist) out.push(p);
  }
  return out;
}
