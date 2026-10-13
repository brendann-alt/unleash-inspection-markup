/** Build the per-media annotation payload stored under this tool's add-on id. */
import { NOTE_KEY, type Inspection } from "../markup/types";

export interface AddonAnnotationPayload {
  version: 1;
  source: "inspection-markup";
  inspectionId: string;
  taxonomy: string;
  width: number;
  height: number;
  shapes: {
    markId: string;
    type: string;
    category: string;
    label: string;
    severity: number;
    /** Absolute source pixels, flat [x1,y1,x2,y2,...] */
    points: number[];
    value: number;
    unit: string;
    note: string;
    asset: string;
  }[];
}

export function toAddonPayload(insp: Inspection, frameId: string): AddonAnnotationPayload | null {
  const f = insp.frames[frameId];
  if (!f) return null;
  const assetName = new Map(insp.assets.map((a) => [a.assetId, a.assetName]));
  return {
    version: 1, source: "inspection-markup", inspectionId: insp.id, taxonomy: insp.taxonomy,
    width: f.width, height: f.height,
    shapes: insp.marks.filter((m) => m.frameId === frameId).map((m) => ({
      markId: m.id, type: m.type, category: m.defectKey === NOTE_KEY ? "note" : m.defectKey,
      label: m.label, severity: m.severity,
      points: m.points.flatMap((p) => [Math.round(p.x * f.width), Math.round(p.y * f.height)]),
      value: m.qty, unit: m.unit || "", note: m.note, asset: assetName.get(m.assetId) ?? m.assetId,
    })),
  };
}
