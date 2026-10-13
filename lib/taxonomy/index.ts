/**
 * Defect taxonomies. Replaces SwiftScope's TRADE_ITEMS.
 *
 * Each defect has a stable numeric cocoId so exported datasets line up with
 * training data across inspections. Never renumber an existing defect: add
 * new ones at the end of the list.
 */
import type { MarkType, Severity, Unit } from "../markup/types";

export interface DefectDef {
  key: string;
  label: string;
  unit: Unit;
  defaultType: MarkType;
  defaultSeverity: Severity;
  cocoId: number;
}

export interface Taxonomy {
  key: string;
  label: string;
  /** What an "asset" tab is called in this domain. */
  assetNoun: string;
  assetPresets: string[];
  /** Reference objects offered first during calibration. */
  references: string[];
  defects: DefectDef[];
}

const d = (
  cocoId: number, key: string, label: string, unit: Unit,
  defaultType: MarkType, defaultSeverity: Severity,
): DefectDef => ({ cocoId, key, label, unit, defaultType, defaultSeverity });

export const TAXONOMIES: Record<string, Taxonomy> = {
  powerline: {
    key: "powerline",
    label: "Powerline",
    assetNoun: "Pole",
    assetPresets: ["Pole", "Span", "Substation bay", "Pole top"],
    references: ["insulator_disc", "crossarm_2400"],
    defects: [
      d(101, "insulator_damage",   "Insulator damage",        "each", "point", 4),
      d(102, "crossarm_rot",       "Crossarm rot / split",    "each", "area",  4),
      d(103, "conductor_damage",   "Conductor damage",        "each", "point", 5),
      d(104, "veg_encroachment",   "Vegetation encroachment", "m",    "line",  3),
      d(105, "bird_nest",          "Bird nest",               "each", "point", 2),
      d(106, "missing_hardware",   "Missing hardware",        "each", "point", 3),
      d(107, "corrosion",          "Corrosion",               "m2",   "area",  2),
      d(108, "pole_lean",          "Pole lean",               "each", "line",  3),
      d(109, "damper_missing",     "Vibration damper issue",  "each", "point", 2),
      d(110, "tie_fault",          "Tie / binder fault",      "each", "point", 3),
      d(111, "hot_spot",           "Thermal hot spot",        "each", "point", 5),
    ],
  },
  solar: {
    key: "solar",
    label: "Solar farm",
    assetNoun: "String",
    assetPresets: ["Block", "String", "Inverter", "Combiner box"],
    references: ["solar_panel"],
    defects: [
      d(201, "cracked_panel",      "Cracked panel",           "each", "point", 4),
      d(202, "soiling",            "Soiling",                 "m2",   "area",  2),
      d(203, "pv_hotspot",         "Hot spot / bypass diode", "each", "point", 4),
      d(204, "shading_veg",        "Vegetation shading",      "m2",   "area",  2),
      d(205, "frame_damage",       "Frame / racking damage",  "each", "point", 3),
      d(206, "connector_burn",     "Connector burn",          "each", "point", 5),
      d(207, "cable_sag",          "Cable sag / exposure",    "m",    "line",  3),
    ],
  },
  telecom: {
    key: "telecom",
    label: "Telecom tower",
    assetNoun: "Tower",
    assetPresets: ["Tower", "Sector A", "Sector B", "Sector C", "Compound"],
    references: ["door"],
    defects: [
      d(301, "antenna_misalign",   "Antenna misalignment",    "each", "point", 3),
      d(302, "tower_corrosion",    "Corrosion",               "m2",   "area",  2),
      d(303, "loose_bolt",         "Loose / missing bolt",    "each", "point", 3),
      d(304, "feeder_damage",      "Feeder cable damage",     "m",    "line",  4),
      d(305, "climb_hazard",       "Climbing hazard",         "each", "point", 5),
      d(306, "paint_failure",      "Paint / coating failure", "m2",   "area",  1),
    ],
  },
  building: {
    key: "building",
    label: "Building / roof",
    assetNoun: "Elevation",
    assetPresets: ["North elevation", "South elevation", "East elevation", "West elevation", "Roof"],
    references: ["door", "brick", "tile_600"],
    defects: [
      d(401, "crack",              "Crack",                   "m",    "line",  3),
      d(402, "spalling",           "Concrete spalling",       "m2",   "area",  4),
      d(403, "bldg_corrosion",     "Corrosion",               "m2",   "area",  2),
      d(404, "water_ingress",      "Water ingress / staining","m2",   "area",  3),
      d(405, "missing_tile",       "Missing / broken tile",   "each", "point", 3),
      d(406, "gutter_blockage",    "Gutter blockage",         "m",    "line",  2),
      d(407, "sealant_failure",    "Sealant failure",         "m",    "line",  2),
      d(408, "flashing_lift",      "Flashing lifted",         "m",    "line",  3),
    ],
  },
};

export function getTaxonomy(key: string | null | undefined): Taxonomy {
  return TAXONOMIES[key ?? ""] ?? TAXONOMIES.powerline;
}

export function findDefect(tax: Taxonomy, key: string): DefectDef | undefined {
  return tax.defects.find((x) => x.key === key);
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Observation",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Critical",
};

export const SEVERITY_COLOURS: Record<number, string> = {
  1: "#64748b",
  2: "#0ea5e9",
  3: "#f59e0b",
  4: "#f97316",
  5: "#dc2626",
};
