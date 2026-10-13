"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InspectionReport from "@/components/InspectionReport";
import { inspection, useInspection } from "@/lib/store";
import { toCoco } from "@/lib/export/coco";
import { toAddonPayload } from "@/lib/export/addon";

function download(name: string, data: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportPage() {
  const router = useRouter();
  const insp = useInspection();
  const [mode, setMode] = useState<"graphql" | "file">("file");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadLocation, setUploadLocation] = useState("");

  useEffect(() => {
    fetch("/api/annotations").then((r) => r.json()).then((j) => setMode(j.mode)).catch(() => {});
  }, []);

  if (!insp) return (
    <div className="center-screen"><div className="card"><p className="h3">No active inspection</p>
      <button className="btn btn-primary" onClick={() => router.push("/")}>Home</button></div></div>
  );

  const slug = insp.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  /** Frames captured on device (live / local file) that are not yet in Media Drive. */
  const unsynced = Object.entries(insp.frames).filter(([, f]) => !f.mediaId);
  /** Frames that came from Media Drive and carry marks: can be written back. */
  const writable = Object.entries(insp.frames).filter(([id, f]) => f.mediaId && insp.marks.some((m) => m.frameId === id));

  async function uploadFrames() {
    if (!uploadLocation) { setMsg("Set a Media Drive location first (teamId/folderId)."); return; }
    setBusy(true); setMsg(null);
    let ok = 0;
    for (const [id, f] of unsynced) {
      const res = await fetch("/api/media/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: f.cleanDataUrl, name: `${slug}_${id}.jpg`, location: uploadLocation }),
      });
      if (res.ok) ok++;
    }
    setBusy(false);
    setMsg(`${ok}/${unsynced.length} frames uploaded. They appear in Media Drive once ingested; open them from Media Drive to write annotations back.`);
  }

  async function writeBack() {
    setBusy(true); setMsg(null);
    let ok = 0; const errors: string[] = [];
    for (const [id, f] of writable) {
      const payload = toAddonPayload(insp!, id);
      const res = await fetch("/api/annotations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: f.mediaId, payload }),
      });
      if (res.ok) ok++; else errors.push((await res.json()).error);
    }
    setBusy(false);
    setMsg(`${ok}/${writable.length} media items updated.${errors[0] ? ` First error: ${errors[0]}` : ""}`);
  }

  return (
    <main className="page stack">
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <button className="btn" onClick={() => router.push("/")}>Home</button>
          <button className="btn" onClick={() => router.push("/inspect?source=live")}>Back to camera</button>
          <button className="btn" onClick={() => router.push("/media")}>Media Drive</button>
        </div>
        <div className="row">
          <button className="btn" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn" onClick={() => download(`${slug}_coco.json`, JSON.stringify(toCoco(insp), null, 2))}>Export COCO</button>
          <button className="btn" onClick={() => download(`${slug}_inspection.json`, JSON.stringify(insp))}>Export raw</button>
        </div>
      </div>

      <div className="card no-print stack">
        <p className="h3">Sync to Unleash live</p>
        {unsynced.length > 0 && (
          <div className="row">
            <input className="input" style={{ flex: 1 }} placeholder="Media Drive location (teamId/folderId)" value={uploadLocation} onChange={(e) => setUploadLocation(e.target.value)} />
            <button className="btn" disabled={busy} onClick={uploadFrames}>Upload {unsynced.length} field frames</button>
          </div>
        )}
        <div className="row">
          <button className="btn btn-primary" disabled={busy || mode !== "graphql" || writable.length === 0} onClick={writeBack}>
            Write annotations to {writable.length} media items
          </button>
          {mode !== "graphql" && <span className="muted small">Write-back is off (UL_ANNOTATION_MODE=file). Use Export COCO.</span>}
        </div>
        {msg && <p className="small">{msg}</p>}
        <button className="btn small" onClick={() => { if (confirm("Clear this inspection from the device?")) { inspection.clear(); router.push("/"); } }}>Clear inspection</button>
      </div>

      <InspectionReport insp={insp} />
    </main>
  );
}
