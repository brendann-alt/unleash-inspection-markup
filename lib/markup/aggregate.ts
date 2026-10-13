/**
 * Roll marks into findings. Port of SwiftScope's aggregateLiveMarkupPins.
 *
 * SwiftScope: six Downlight taps -> one "Downlight x 6" quote line.
 * Here:       six insulator taps on Pole 14 -> one finding, qty 6,
 *             severity = worst of the six, with every evidence frame kept.
 *
 * Notes are never aggregated; each one stays its own observation.
 */
import { NOTE_KEY, type Mark, type Severity } from "./types";

export interface Finding {
  key: string;
  assetId: string;
  defectKey: string;
  label: string;
  quantity: number;
  unit: string;
  maxSeverity: Severity;
  markCount: number;
  markIds: string[];
  frameIds: string[];
  notes: string[];
}

export function aggregateMarks(marks: Mark[]): Finding[] {
  const map = new Map<string, Finding>();
  const notes: Finding[] = [];

  for (const m of marks) {
    if (m.defectKey === NOTE_KEY) {
      notes.push({
        key: m.id, assetId: m.assetId, defectKey: NOTE_KEY, label: m.note || m.label,
        quantity: 0, unit: "", maxSeverity: m.severity, markCount: 1,
        markIds: [m.id], frameIds: [m.frameId], notes: m.note ? [m.note] : [],
      });
      continue;
    }
    const unit = m.unit || "each";
    const key = `${m.assetId}::${m.defectKey}::${unit}`;
    const q = Number.isFinite(m.qty) && m.qty > 0 ? m.qty : 1;
    const f = map.get(key);
    if (f) {
      f.quantity = Math.round((f.quantity + q) * 100) / 100;
      f.maxSeverity = Math.max(f.maxSeverity, m.severity) as Severity;
      f.markCount += 1;
      f.markIds.push(m.id);
      if (!f.frameIds.includes(m.frameId)) f.frameIds.push(m.frameId);
      if (m.note) f.notes.push(m.note);
    } else {
      map.set(key, {
        key, assetId: m.assetId, defectKey: m.defectKey, label: m.label,
        quantity: Math.round(q * 100) / 100, unit, maxSeverity: m.severity,
        markCount: 1, markIds: [m.id], frameIds: [m.frameId],
        notes: m.note ? [m.note] : [],
      });
    }
  }

  return [...map.values(), ...notes].sort(
    (a, b) => b.maxSeverity - a.maxSeverity || a.label.localeCompare(b.label),
  );
}

/** Asset-level rollup for the report header and the asset list. */
export function assetRisk(findings: Finding[]) {
  const out = new Map<string, { maxSeverity: number; findings: number; critical: number }>();
  for (const f of findings) {
    const r = out.get(f.assetId) ?? { maxSeverity: 0, findings: 0, critical: 0 };
    r.maxSeverity = Math.max(r.maxSeverity, f.maxSeverity);
    r.findings += 1;
    if (f.maxSeverity >= 5) r.critical += 1;
    out.set(f.assetId, r);
  }
  return out;
}
