/**
 * Spatial measurement. Port of SwiftScope's SpatialMeasurementEngine,
 * extended with GSD calibration for drone imagery.
 *
 * Everything works in SOURCE-frame pixels so a measurement is the same
 * whether it was drawn on a phone or a 4K monitor.
 */
import type { Pt } from "./types";

/** Known-size reference objects. Widths in metres. Typical AU values; verify per network. */
export const REFERENCE_OBJECTS: Record<string, { label: string; width: number; hint: string }> = {
  insulator_disc: { label: "Insulator disc (254mm)", width: 0.254, hint: "Align box to one disc diameter" },
  crossarm_2400:  { label: "Crossarm (2.4m)",        width: 2.4,   hint: "Align box to full crossarm length" },
  solar_panel:    { label: "Solar panel (1.134m)",   width: 1.134, hint: "Align box to panel short edge" },
  door:           { label: "Standard door (810mm)",  width: 0.81,  hint: "Align box to door width" },
  brick:          { label: "Brick (230mm)",          width: 0.23,  hint: "Align box to brick length" },
  gpo:            { label: "Power point (115mm)",    width: 0.115, hint: "Align box to GPO width" },
  tile_600:       { label: "Tile 600mm",             width: 0.6,   hint: "Align box to tile width" },
};

/** metres per source pixel from a reference box. */
export function calibrateFromReference(realWidthM: number, boxWidthSourcePx: number): number {
  if (!(realWidthM > 0) || !(boxWidthSourcePx > 0)) throw new Error("Invalid calibration dimensions");
  return realWidthM / boxWidthSourcePx;
}

/**
 * Ground sample distance for a nadir drone image.
 * GSD (m/px) = (sensorWidth_mm * altitude_m) / (focalLength_mm * imageWidth_px)
 * Only valid for nadir (straight-down) shots over flat ground. Oblique shots
 * need a reference object instead.
 */
export function calibrateFromGsd(p: {
  altitudeM: number;
  sensorWidthMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
}): number {
  const { altitudeM, sensorWidthMm, focalLengthMm, imageWidthPx } = p;
  if (![altitudeM, sensorWidthMm, focalLengthMm, imageWidthPx].every((v) => v > 0)) {
    throw new Error("Invalid GSD inputs");
  }
  return (sensorWidthMm * altitudeM) / (focalLengthMm * imageWidthPx);
}

/** Common drone sensors. Values from manufacturer spec sheets; verify against EXIF. */
export const DRONE_SENSORS: Record<string, { label: string; sensorWidthMm: number; focalLengthMm: number }> = {
  m3e_wide:   { label: "Mavic 3E wide",      sensorWidthMm: 17.3, focalLengthMm: 12.29 },
  m30_wide:   { label: "Matrice 30 wide",    sensorWidthMm: 6.4,  focalLengthMm: 4.5 },
  p1_35mm:    { label: "Zenmuse P1 35mm",    sensorWidthMm: 35.9, focalLengthMm: 35 },
  h20_wide:   { label: "Zenmuse H20 wide",   sensorWidthMm: 6.17, focalLengthMm: 4.5 },
};

function toPx(p: Pt, w: number, h: number) {
  return { x: p.x * w, y: p.y * h };
}

/** Line length in metres, 2dp. Points are normalised. */
export function lineLength(a: Pt, b: Pt, frameW: number, frameH: number, metresPerPx: number): number {
  if (!(metresPerPx > 0)) return 0;
  const pa = toPx(a, frameW, frameH);
  const pb = toPx(b, frameW, frameH);
  const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  return Math.round(d * metresPerPx * 100) / 100;
}

/** Polygon area in m2 via shoelace, 2dp. Points are normalised. */
export function polygonArea(pts: Pt[], frameW: number, frameH: number, metresPerPx: number): number {
  if (pts.length < 3 || !(metresPerPx > 0)) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = toPx(pts[i], frameW, frameH);
    const b = toPx(pts[(i + 1) % pts.length], frameW, frameH);
    s += a.x * b.y - b.x * a.y;
  }
  const areaPx = Math.abs(s) / 2;
  return Math.round(areaPx * metresPerPx * metresPerPx * 100) / 100;
}

/** Bounding box in source pixels [x, y, w, h] (COCO order). */
export function bbox(pts: Pt[], frameW: number, frameH: number, minSizePx = 0): [number, number, number, number] {
  const xs = pts.map((p) => p.x * frameW);
  const ys = pts.map((p) => p.y * frameH);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < minSizePx) { const c = (x0 + x1) / 2; x0 = c - minSizePx / 2; x1 = c + minSizePx / 2; }
  if (y1 - y0 < minSizePx) { const c = (y0 + y1) / 2; y0 = c - minSizePx / 2; y1 = c + minSizePx / 2; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(frameW, x1); y1 = Math.min(frameH, y1);
  const r = (n: number) => Math.round(n * 10) / 10;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}
