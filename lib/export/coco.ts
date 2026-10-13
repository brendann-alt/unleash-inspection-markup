/**
 * COCO export. Matches the COCO-format annotation workflow used on the
 * Unleash Live side, so field markup can feed model training directly.
 *
 * - images: every frame that carries at least one classified mark
 * - categories: the full taxonomy (stable ids, even if unused)
 * - annotations: bbox for everything; segmentation polygon for zones;
 *   inspection data (severity, asset, measured value, note) under `attributes`
 * Notes are not exported: they are not a class.
 */
import { NOTE_KEY, type Inspection } from "../markup/types";
import { bbox } from "../markup/measure";
import { getTaxonomy } from "../taxonomy";

export interface CocoDataset {
  info: { description: string; version: string; date_created: string; contributor: string };
  images: { id: number; file_name: string; width: number; height: number; date_captured: string; unleash_media_id?: string }[];
  categories: { id: number; name: string; supercategory: string }[];
  annotations: {
    id: number; image_id: number; category_id: number;
    bbox: [number, number, number, number]; area: number; iscrowd: 0;
    segmentation: number[][];
    attributes: { severity: number; asset: string; mark_type: string; value: number; unit: string; note: string; mark_id: string };
  }[];
}

/** Points are a single tap; give them a box big enough to be useful for training. */
const POINT_BOX_FRACTION = 0.04;

export function toCoco(insp: Inspection): CocoDataset {
  const tax = getTaxonomy(insp.taxonomy);
  const catId = new Map(tax.defects.map((d) => [d.key, d.cocoId]));
  const assetName = new Map(insp.assets.map((a) => [a.assetId, a.assetName]));

  const classified = insp.marks.filter((m) => m.defectKey !== NOTE_KEY && catId.has(m.defectKey));
  const frameIds = [...new Set(classified.map((m) => m.frameId))].filter((id) => insp.frames[id]);
  const imageId = new Map(frameIds.map((id, i) => [id, i + 1]));

  const images = frameIds.map((id) => {
    const f = insp.frames[id];
    return {
      id: imageId.get(id)!, file_name: `${insp.id}_${id}.jpg`, width: f.width, height: f.height,
      date_captured: f.capturedAt, ...(f.mediaId ? { unleash_media_id: f.mediaId } : {}),
    };
  });

  const annotations = classified.filter((m) => imageId.has(m.frameId)).map((m, i) => {
    const f = insp.frames[m.frameId];
    const minBox = m.type === "point" ? Math.min(f.width, f.height) * POINT_BOX_FRACTION : 4;
    const box = bbox(m.points, f.width, f.height, minBox);
    const poly = m.points.length >= 3
      ? [m.points.flatMap((p) => [Math.round(p.x * f.width * 10) / 10, Math.round(p.y * f.height * 10) / 10])]
      : [];
    const area = poly.length ? shoelacePx(poly[0]) : box[2] * box[3];
    return {
      id: i + 1, image_id: imageId.get(m.frameId)!, category_id: catId.get(m.defectKey)!,
      bbox: box, area: Math.round(area * 10) / 10, iscrowd: 0 as const, segmentation: poly,
      attributes: {
        severity: m.severity, asset: assetName.get(m.assetId) ?? m.assetId, mark_type: m.type,
        value: m.qty, unit: m.unit || "each", note: m.note, mark_id: m.id,
      },
    };
  });

  return {
    info: { description: `${insp.name} (${tax.label})`, version: "1.0", date_created: new Date().toISOString(), contributor: "Unleash live Inspection Markup" },
    images,
    categories: tax.defects.map((d) => ({ id: d.cocoId, name: d.key, supercategory: tax.key })),
    annotations,
  };
}

function shoelacePx(flat: number[]) {
  let s = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return Math.abs(s) / 2;
}
