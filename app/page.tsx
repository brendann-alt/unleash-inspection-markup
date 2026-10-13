"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TAXONOMIES } from "@/lib/taxonomy";
import { inspection, useInspection } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const current = useInspection();
  const [name, setName] = useState("");
  const [tax, setTax] = useState("powerline");
  const [asset, setAsset] = useState("");

  function start(next: string) {
    const t = TAXONOMIES[tax];
    inspection.start(name.trim() || `${t.label} inspection ${new Date().toLocaleDateString("en-AU")}`, tax, asset.trim() || `${t.assetNoun} 1`);
    router.push(next);
  }

  return (
    <main className="page stack">
      <div>
        <p className="muted small">Unleash live</p>
        <h1 className="h1">Inspection markup</h1>
        <p className="muted">Pin, measure and grade defects on a live camera or on drone imagery from Media Drive. Export to COCO or write back to the media item.</p>
      </div>

      {current && (
        <div className="card row" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="h3">{current.name}</p>
            <p className="muted small">{current.marks.length} marks across {current.assets.length} assets</p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => router.push("/inspect?source=live")}>Resume camera</button>
            <button className="btn" onClick={() => router.push("/media")}>Add from Media Drive</button>
            <button className="btn btn-primary" onClick={() => router.push("/report")}>Report</button>
          </div>
        </div>
      )}

      <div className="card">
        <p className="h2">New inspection</p>
        <label className="field">Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Feeder 14 pole-top, Oct 2026" />
        </label>
        <label className="field">Asset class
          <select className="select" value={tax} onChange={(e) => setTax(e.target.value)}>
            {Object.values(TAXONOMIES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="field">First {TAXONOMIES[tax].assetNoun.toLowerCase()}
          <input className="input" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder={`${TAXONOMIES[tax].assetNoun} 1`} />
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={() => start("/inspect?source=live")}>Live camera</button>
          <button className="btn" onClick={() => start("/media")}>Drone images (Media Drive)</button>
          <button className="btn" onClick={() => start("/inspect?source=file")}>Local image</button>
        </div>
        {current && <p className="muted small">Starting a new inspection replaces the current one on this device. Export first.</p>}
      </div>
    </main>
  );
}
