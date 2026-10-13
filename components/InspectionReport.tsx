"use client";
/**
 * Inspection report. Port of SwiftScope's SiteAnnotationReport:
 * grouped by asset (was room), one card per finding (was per item type,
 * not per pin), evidence frames attached. Ordered by severity, not price.
 */
import { aggregateMarks, assetRisk } from "@/lib/markup/aggregate";
import { getTaxonomy, SEVERITY_COLOURS, SEVERITY_LABELS } from "@/lib/taxonomy";
import { NOTE_KEY, type Inspection } from "@/lib/markup/types";
import { inspection } from "@/lib/store";
import EvidenceImage from "./EvidenceImage";

export function SeverityBadge({ s }: { s: number }) {
  return <span className="badge" style={{ background: SEVERITY_COLOURS[s] ?? "#64748b" }}>S{s} {SEVERITY_LABELS[s]}</span>;
}

export default function InspectionReport({ insp }: { insp: Inspection }) {
  const tax = getTaxonomy(insp.taxonomy);
  const findings = aggregateMarks(insp.marks);
  const risk = assetRisk(findings.filter((f) => f.defectKey !== NOTE_KEY));
  const classified = findings.filter((f) => f.defectKey !== NOTE_KEY);
  const critical = classified.filter((f) => f.maxSeverity >= 5).length;

  return (
    <div className="stack">
      <div className="card">
        <p className="muted small">{tax.label} inspection · {new Date(insp.createdAt).toLocaleString("en-AU")}</p>
        <h2 className="h1">{insp.name}</h2>
        <p className="muted">
          {insp.marks.length} marks → {classified.length} findings across {insp.assets.length} {tax.assetNoun.toLowerCase()}{insp.assets.length !== 1 ? "s" : ""}
          {critical > 0 && <> · <strong style={{ color: SEVERITY_COLOURS[5] }}>{critical} critical</strong></>}
        </p>
      </div>

      {[...insp.assets]
        .sort((a, b) => (risk.get(b.assetId)?.maxSeverity ?? 0) - (risk.get(a.assetId)?.maxSeverity ?? 0))
        .map((a) => {
          const af = findings.filter((f) => f.assetId === a.assetId);
          if (af.length === 0) return null;
          const r = risk.get(a.assetId);
          return (
            <section key={a.assetId} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="h2">{a.assetName}</h3>
                {r && r.maxSeverity > 0 && <SeverityBadge s={r.maxSeverity} />}
              </div>
              {a.calibration && (
                <p className="muted small">Calibrated by {a.calibration.method}{a.calibration.refKey ? ` (${a.calibration.refKey})` : ""}. Measurements are estimates from imagery.</p>
              )}
              {af.map((f) => {
                const marks = insp.marks.filter((m) => f.markIds.includes(m.id));
                return (
                  <div key={f.key} className="finding">
                    <div>
                      <p className="h3">{f.defectKey === NOTE_KEY ? "Note" : f.label}</p>
                      <p className="muted small">
                        {f.defectKey === NOTE_KEY ? f.label : `${f.quantity} ${f.unit}${f.markCount > 1 ? ` · ${f.markCount} marks` : ""}`}
                      </p>
                      {f.defectKey !== NOTE_KEY && f.notes.map((n, i) => <p key={i} className="small">“{n}”</p>)}
                      <div className="thumbs">
                        {f.frameIds.slice(0, 6).map((fid) => insp.frames[fid] && (
                          <EvidenceImage key={fid} frame={insp.frames[fid]}
                            marks={insp.marks.filter((m) => m.frameId === fid)} highlight={f.markIds} />
                        ))}
                      </div>
                    </div>
                    <div className="stack" style={{ textAlign: "right" }}>
                      {f.defectKey !== NOTE_KEY && <SeverityBadge s={f.maxSeverity} />}
                      <button className="btn small no-print" onClick={() => marks.forEach((m) => inspection.removeMark(m.id))}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
    </div>
  );
}
