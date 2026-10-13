import { describe, expect, it } from "vitest";
import { calibrateFromGsd, calibrateFromReference, lineLength, polygonArea, bbox } from "@/lib/markup/measure";
import { aggregateMarks } from "@/lib/markup/aggregate";
import { toCoco } from "@/lib/export/coco";
import { toAddonPayload } from "@/lib/export/addon";
import { NOTE_KEY, type Inspection, type Mark } from "@/lib/markup/types";

const mark = (p: Partial<Mark>): Mark => ({
  id: Math.random().toString(36).slice(2), type: "point", points: [{ x: 0.5, y: 0.5 }],
  defectKey: "insulator_damage", label: "Insulator damage", assetId: "a1", severity: 3,
  qty: 1, unit: "each", calculatedValue: null, note: "", colour: "#f00", frameId: "f1", ...p,
});

describe("measure", () => {
  it("reference calibration", () => {
    // 254mm disc spans 127 source px -> 2mm/px
    expect(calibrateFromReference(0.254, 127)).toBeCloseTo(0.002);
  });
  it("GSD for Mavic 3E at 30m", () => {
    // (17.3 * 30) / (12.29 * 5280) ~= 0.008 m/px (8mm)
    expect(calibrateFromGsd({ altitudeM: 30, sensorWidthMm: 17.3, focalLengthMm: 12.29, imageWidthPx: 5280 })).toBeCloseTo(0.008, 3);
  });
  it("line length is resolution independent", () => {
    // half the width of a 1000px frame at 1cm/px = 5m
    expect(lineLength({ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, 1000, 800, 0.01)).toBe(5);
  });
  it("polygon area", () => {
    const sq = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }];
    // 100x100 px at 1cm/px = 1m2
    expect(polygonArea(sq, 1000, 1000, 0.01)).toBe(1);
  });
  it("bbox pads tiny shapes and clamps to frame", () => {
    expect(bbox([{ x: 0, y: 0 }], 1000, 1000, 40)).toEqual([0, 0, 20, 20]);
  });
});

describe("aggregate", () => {
  it("rolls identical defects on one asset into one finding with worst severity", () => {
    const f = aggregateMarks([
      mark({ severity: 2 }), mark({ severity: 5, frameId: "f2" }), mark({ severity: 3 }),
      mark({ assetId: "a2" }),
    ]);
    const a1 = f.find((x) => x.assetId === "a1")!;
    expect(a1.quantity).toBe(3);
    expect(a1.maxSeverity).toBe(5);
    expect(a1.frameIds).toEqual(["f1", "f2"]);
    expect(f[0]).toBe(a1); // sorted worst first
  });
  it("sums run lengths and keeps notes separate", () => {
    const f = aggregateMarks([
      mark({ defectKey: "veg_encroachment", unit: "m", qty: 2.4, type: "line" }),
      mark({ defectKey: "veg_encroachment", unit: "m", qty: 1.1, type: "line" }),
      mark({ defectKey: NOTE_KEY, note: "Access via rear gate", qty: 0, unit: "" }),
    ]);
    expect(f.find((x) => x.defectKey === "veg_encroachment")!.quantity).toBe(3.5);
    expect(f.filter((x) => x.defectKey === NOTE_KEY)).toHaveLength(1);
  });
});

describe("exports", () => {
  const insp: Inspection = {
    id: "i1", name: "Test", taxonomy: "powerline", createdAt: "2026-10-13T00:00:00Z",
    assets: [{ assetId: "a1", assetName: "Pole 14", calibration: null }],
    frames: { f1: { cleanDataUrl: "data:image/jpeg;base64,", width: 2000, height: 1000, capturedAt: "2026-10-13T00:00:00Z", source: "media", mediaId: "m1" } },
    marks: [
      mark({}),
      mark({ type: "area", defectKey: "corrosion", unit: "m2", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }] }),
      mark({ defectKey: NOTE_KEY, note: "check" }),
    ],
  };
  it("COCO uses stable category ids and source-pixel geometry", () => {
    const c = toCoco(insp);
    expect(c.images).toHaveLength(1);
    expect(c.images[0].unleash_media_id).toBe("m1");
    expect(c.annotations).toHaveLength(2); // note excluded
    expect(c.annotations[0].category_id).toBe(101);
    expect(c.annotations[1].segmentation[0].slice(0, 2)).toEqual([200, 100]);
    expect(c.annotations[1].area).toBe(10000); // triangle 200px base x 100px high
    expect(c.categories.find((x) => x.name === "corrosion")!.id).toBe(107);
  });
  it("add-on payload carries every mark on the frame in absolute pixels", () => {
    const p = toAddonPayload(insp, "f1")!;
    expect(p.shapes).toHaveLength(3);
    expect(p.shapes[0].points).toEqual([1000, 500]);
    expect(p.shapes[0].asset).toBe("Pole 14");
  });
});
