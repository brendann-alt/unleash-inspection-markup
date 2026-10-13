/**
 * Core markup types.
 *
 * Ported from SwiftScope live site markup (app/camera/page.tsx), with two
 * structural changes for inspection work:
 *
 * 1. Points are stored NORMALISED (0..1) against the source frame, not in
 *    screen pixels. SwiftScope only ever needed screen coords because marks
 *    became quote lines. Inspection marks become COCO annotations and
 *    Unleash Live media annotations, so they must map back to real image
 *    pixels regardless of device, zoom or orientation.
 *
 * 2. "Room" becomes "Asset" (pole, structure, string, tower, roof face) and
 *    price becomes severity. Aggregation ranks risk, it does not total cost.
 */

export type MarkType = "point" | "line" | "area" | "note";

/** 1 = observation, 5 = critical / immediate action. */
export type Severity = 1 | 2 | 3 | 4 | 5;

export type Unit = "each" | "m" | "m2";

export interface Pt {
  /** 0..1 across the source frame width */
  x: number;
  /** 0..1 down the source frame height */
  y: number;
}

export interface FrameRef {
  /**
   * Clean frame, no markup burned in. Used for COCO, training data and
   * Media Drive upload. Evidence images for the report are rendered from
   * this plus the frame's marks at view time (components/EvidenceImage),
   * so editing a mark later never leaves a stale burned-in photo.
   */
  cleanDataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
  source: "live" | "media" | "file";
  /** Unleash Live Media Drive item id, when the frame came from Media Drive. */
  mediaId?: string;
  gps?: { lat: number; lng: number; alt?: number };
}

export interface Mark {
  id: string;
  type: MarkType;
  points: Pt[];
  /** Taxonomy defect key, or "__note__" for unclassified observations. */
  defectKey: string;
  label: string;
  assetId: string;
  severity: Severity;
  /** Count (1) for points, metres for lines, m2 for areas. User-confirmed. */
  qty: number;
  unit: Unit | "";
  /** Raw engine output before the inspector edited it. */
  calculatedValue: number | null;
  note: string;
  colour: string;
  frameId: string;
}

export type CalibrationMethod = "reference" | "gsd" | "custom";

export interface Calibration {
  method: CalibrationMethod;
  refKey?: string;
  /** Real-world metres per SOURCE-frame pixel. */
  metresPerPx: number;
}

export interface AssetSession {
  assetId: string;
  assetName: string;
  calibration: Calibration | null;
}

export interface Inspection {
  id: string;
  name: string;
  taxonomy: string;
  createdAt: string;
  assets: AssetSession[];
  frames: Record<string, FrameRef>;
  marks: Mark[];
}

export const NOTE_KEY = "__note__";
