"use client";
/**
 * MarkupCanvas: the inspection markup engine.
 *
 * Direct port of SwiftScope's live site markup (app/camera/page.tsx):
 *   - Tap = pin, two taps = run (start/end as separate taps so the finger
 *     never covers the point being placed), trace = zone, note mode.
 *   - Stamp mode for fast repeated pins of the same defect.
 *   - Per-asset calibration (was per-room) via a reference box.
 *   - Marks fade on the live feed so the inspector sees what's placed.
 *
 * Added for inspection:
 *   - Works on a still drone image from Media Drive as well as the live camera.
 *   - Points stored normalised to the source frame (letterbox-aware).
 *   - GSD calibration for nadir drone shots.
 *   - Severity on every mark.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inspection, uid } from "@/lib/store";
import { getTaxonomy, findDefect, SEVERITY_LABELS, SEVERITY_COLOURS } from "@/lib/taxonomy";
import {
  REFERENCE_OBJECTS, DRONE_SENSORS, calibrateFromReference, calibrateFromGsd, lineLength, polygonArea,
} from "@/lib/markup/measure";
import { drawShape, drawTrace, drawHint, project, simplify } from "@/lib/markup/render";
import { NOTE_KEY, type Inspection, type Mark, type MarkType, type Pt, type Severity } from "@/lib/markup/types";

type Source =
  | { kind: "live" }
  | { kind: "image"; url: string; mediaId?: string; name?: string };

const COLOURS = ["#FFB400", "#EF4444", "#3B82F6", "#10B981", "#8B5CF6", "#F97316"];

export default function MarkupCanvas({ insp, source }: { insp: Inspection; source: Source }) {
  const router = useRouter();
  const tax = getTaxonomy(insp.taxonomy);

  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<MarkType>("point");
  const [cur, setCur] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [colourIdx, setColourIdx] = useState(0);
  const [stamp, setStamp] = useState(source.kind === "live");
  const [stampKey, setStampKey] = useState(tax.defects[0].key);
  const [activeAsset, setActiveAsset] = useState(insp.assets[0].assetId);
  const [fresh, setFresh] = useState<Record<string, number>>({}); // live mode fade: markId -> placedAt

  // Pending form state
  const [pending, setPending] = useState<{ pts: Pt[]; frameId: string; calc: number | null } | null>(null);
  const [fDefect, setFDefect] = useState(tax.defects[0].key);
  const [fSev, setFSev] = useState<Severity>(3);
  const [fQty, setFQty] = useState(1);
  const [fNote, setFNote] = useState("");
  const [fNoteOnly, setFNoteOnly] = useState(false);

  // Calibration
  const [calib, setCalib] = useState<null | "pick" | "box" | "gsd">(null);
  const [refKey, setRefKey] = useState(tax.references[0] ?? "door");
  const [boxFrac, setBoxFrac] = useState(0.4);
  const [customM, setCustomM] = useState("");
  const [gsd, setGsd] = useState({ altitude: "30", sensor: Object.keys(DRONE_SENSORS)[0] });

  // Still image: one frame shared by every mark on it
  const stillFrameId = useRef<string | null>(null);

  const asset = insp.assets.find((a) => a.assetId === activeAsset) ?? insp.assets[0];
  const cal = asset.calibration;

  /* ── Source setup ─────────────────────────────────────────────── */
  useEffect(() => {
    if (source.kind !== "live") return;
    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        v.onloadedmetadata = () => { void v.play(); setReady(true); };
      } catch (e) {
        setErr(e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera access denied. Allow camera in the browser address bar."
          : "Could not open camera.");
      }
    })();
    return () => { stopped = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [source.kind]);

  /** Natural size of the source and where it sits on screen (object-fit: contain). */
  const geometry = useCallback(() => {
    const wrap = wrapRef.current;
    const el = source.kind === "live" ? videoRef.current : imgRef.current;
    if (!wrap || !el) return null;
    const sw = source.kind === "live" ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth;
    const sh = source.kind === "live" ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight;
    if (!sw || !sh) return null;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const k = Math.min(cw / sw, ch / sh);
    const dw = sw * k, dh = sh * k;
    return { sw, sh, cw, ch, dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
  }, [source.kind]);

  const toNorm = useCallback((clientX: number, clientY: number): Pt | null => {
    const g = geometry(); const o = overlayRef.current;
    if (!g || !o) return null;
    const r = o.getBoundingClientRect();
    const x = (clientX - r.left - g.dx) / g.dw;
    const y = (clientY - r.top - g.dy) / g.dh;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null; // tap landed in the letterbox
    return { x, y };
  }, [geometry]);

  const toScreen = useCallback((pts: Pt[]) => {
    const g = geometry();
    if (!g) return [];
    return project(pts, g.dw, g.dh).map((p) => ({ x: p.x + g.dx, y: p.y + g.dy }));
  }, [geometry]);

  /* ── Overlay render loop ──────────────────────────────────────── */
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const loop = () => {
      const o = overlayRef.current, wrap = wrapRef.current;
      if (o && wrap) {
        if (o.width !== wrap.clientWidth || o.height !== wrap.clientHeight) {
          o.width = wrap.clientWidth; o.height = wrap.clientHeight;
        }
        const ctx = o.getContext("2d")!;
        ctx.clearRect(0, 0, o.width, o.height);
        const now = performance.now();

        // Placed marks: persistent on a still image, fading on live video
        for (const m of insp.marks) {
          if (m.assetId !== activeAsset) continue;
          let alpha = 1;
          if (source.kind === "live") {
            const t = fresh[m.id];
            if (t === undefined) continue;
            alpha = Math.max(0, 1 - Math.max(0, now - t - 1200) / 900);
            if (alpha <= 0) continue;
          } else if (m.frameId !== stillFrameId.current) continue;
          ctx.globalAlpha = alpha;
          drawShape(ctx, toScreen(m.points), { colour: m.colour, label: m.label, measure: measureText(m) });
          ctx.globalAlpha = 1;
        }

        // In-progress gesture
        const c = COLOURS[colourIdx % COLOURS.length];
        const sp = toScreen(cur);
        if (mode === "line" && sp.length === 1) {
          drawShape(ctx, sp, { colour: c });
          drawHint(ctx, sp[0].x, sp[0].y, "Tap the end point");
        } else if (sp.length >= 2) drawTrace(ctx, sp, c);

        // Calibration target box
        if (calib === "box") {
          const g = geometry();
          if (g) {
            const bw = g.dw * boxFrac, bh = Math.max(40, bw * 0.35);
            const bx = g.dx + (g.dw - bw) / 2, by = g.dy + (g.dh - bh) / 2;
            ctx.strokeStyle = "#FFB400"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
            ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([]);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, insp.marks, activeAsset, fresh, cur, mode, colourIdx, calib, boxFrac, toScreen, geometry, source.kind]);

  function measureText(m: Mark) {
    if (m.unit === "m") return `${m.qty}m`;
    if (m.unit === "m2") return `${m.qty}m²`;
    return undefined;
  }

  /* ── Frame capture ────────────────────────────────────────────── */
  function grabFrame(): string | null {
    const g = geometry();
    if (!g) return null;
    if (source.kind === "image" && stillFrameId.current) return stillFrameId.current;
    const el = source.kind === "live" ? videoRef.current! : imgRef.current!;
    const c = document.createElement("canvas");
    c.width = g.sw; c.height = g.sh;
    c.getContext("2d")!.drawImage(el, 0, 0, g.sw, g.sh);
    let dataUrl = "";
    try { dataUrl = c.toDataURL("image/jpeg", 0.82); }
    catch { setErr("Image is cross-origin. Load Media Drive images through /api/media/file."); return null; }
    const id = inspection.addFrame({
      cleanDataUrl: dataUrl, width: g.sw, height: g.sh, capturedAt: new Date().toISOString(),
      source: source.kind === "live" ? "live" : source.mediaId ? "media" : "file",
      mediaId: source.kind === "image" ? source.mediaId : undefined,
    });
    if (source.kind === "image") stillFrameId.current = id;
    return id;
  }

  function computeMeasure(pts: Pt[], frameW: number, frameH: number): number | null {
    if (!cal) return null;
    if (pts.length === 2) return lineLength(pts[0], pts[1], frameW, frameH, cal.metresPerPx);
    if (pts.length >= 3) return polygonArea(pts, frameW, frameH, cal.metresPerPx);
    return null;
  }

  function commit(pts: Pt[], frameId: string, defectKey: string, sev: Severity, qty: number, note: string, calc: number | null) {
    const def = findDefect(tax, defectKey);
    const isNote = defectKey === NOTE_KEY;
    const id = uid();
    inspection.addMark({
      id, type: isNote ? "note" : mode, points: pts, defectKey,
      label: isNote ? note : def?.label ?? defectKey,
      assetId: activeAsset, severity: sev,
      qty: isNote ? 0 : qty, unit: isNote ? "" : def?.unit ?? "each",
      calculatedValue: calc, note, colour: isNote ? "#a855f7" : SEVERITY_COLOURS[sev] ?? COLOURS[colourIdx],
      frameId,
    });
    setColourIdx((i) => i + 1);
    setFresh((f) => ({ ...f, [id]: performance.now() }));
  }

  function capture(pts: Pt[]) {
    const g = geometry();
    const frameId = grabFrame();
    if (!g || !frameId) return;

    // Stamp mode: points only, straight in, no form (same rule as SwiftScope)
    if (stamp && mode === "point") {
      const def = findDefect(tax, stampKey)!;
      commit(pts, frameId, def.key, def.defaultSeverity, 1, "", null);
      return;
    }
    const calc = computeMeasure(pts, g.sw, g.sh);
    const def = tax.defects.find((x) => x.defaultType === mode) ?? tax.defects[0];
    setFDefect(def.key);
    setFSev(def.defaultSeverity);
    setFQty(calc ?? 1);
    setFNote("");
    setFNoteOnly(mode === "note");
    setPending({ pts, frameId, calc });
  }

  function submitForm() {
    if (!pending) return;
    if (fNoteOnly) {
      if (!fNote.trim()) return;
      commit(pending.pts, pending.frameId, NOTE_KEY, fSev, 0, fNote.trim(), null);
    } else {
      commit(pending.pts, pending.frameId, fDefect, fSev, fQty, fNote.trim(), pending.calc);
    }
    setPending(null);
  }

  /* ── Gestures ─────────────────────────────────────────────────── */
  function clientXY(e: React.PointerEvent) { return { x: e.clientX, y: e.clientY }; }

  function onDown(e: React.PointerEvent) {
    if (calib || pending) return;
    const { x, y } = clientXY(e);
    const p = toNorm(x, y);
    if (!p) return;
    if (mode === "point") { capture([p]); return; }
    if (mode === "line") {
      if (cur.length === 0) { setCur([p]); return; }
      const line = [cur[0], p];
      setCur([]);
      capture(line);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrawing(true); setCur([p]);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing) return;
    const p = toNorm(e.clientX, e.clientY);
    if (p) setCur((c) => [...c, p]);
  }
  function onUp() {
    if (!drawing) return;
    setDrawing(false);
    const pts = simplify(cur);
    setCur([]);
    if (mode === "area" && pts.length >= 3) capture(pts);
    else if (mode === "note" && pts.length >= 1) capture(pts.length >= 3 ? pts : [pts[0]]);
  }

  /* ── Calibration ──────────────────────────────────────────────── */
  function lockBox() {
    const g = geometry();
    if (!g) return;
    const boxSourcePx = g.sw * boxFrac; // box is a fraction of the displayed image width
    const real = refKey === "custom" ? parseFloat(customM) : REFERENCE_OBJECTS[refKey]?.width;
    try {
      const mpp = calibrateFromReference(real ?? NaN, boxSourcePx);
      inspection.setCalibration(activeAsset, { method: refKey === "custom" ? "custom" : "reference", refKey, metresPerPx: mpp });
      setCalib(null);
    } catch { /* invalid input, leave panel open */ }
  }
  function lockGsd() {
    const g = geometry();
    const s = DRONE_SENSORS[gsd.sensor];
    if (!g || !s) return;
    try {
      const mpp = calibrateFromGsd({ altitudeM: parseFloat(gsd.altitude), sensorWidthMm: s.sensorWidthMm, focalLengthMm: s.focalLengthMm, imageWidthPx: g.sw });
      inspection.setCalibration(activeAsset, { method: "gsd", refKey: gsd.sensor, metresPerPx: mpp });
      setCalib(null);
    } catch { /* invalid */ }
  }

  /* ── Render ───────────────────────────────────────────────────── */
  if (err) return (
    <div className="center-screen">
      <div className="card"><p className="h3">Can&apos;t open source</p><p className="muted">{err}</p>
        <button className="btn" onClick={() => router.push("/")}>Back</button></div>
    </div>
  );

  const assetMarks = insp.marks.filter((m) => m.assetId === activeAsset).length;

  return (
    <div className="markup-root">
      <div ref={wrapRef} className="markup-stage">
        {source.kind === "live" ? (
          <video ref={videoRef} playsInline muted className="markup-media" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef} src={source.url} alt={source.name ?? "Inspection image"} crossOrigin="anonymous"
            className="markup-media" onLoad={() => setReady(true)} onError={() => setErr("Image failed to load.")} />
        )}
        <canvas ref={overlayRef} className="markup-overlay"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>

      {/* Asset tabs (SwiftScope: rooms) */}
      <div className="bar bar-top">
        {insp.assets.map((a) => (
          <button key={a.assetId} className={`chip ${a.assetId === activeAsset ? "chip-on" : ""}`}
            onClick={() => setActiveAsset(a.assetId)}
            onDoubleClick={() => { const n = prompt(`Rename ${tax.assetNoun}`, a.assetName); if (n) inspection.renameAsset(a.assetId, n); }}>
            {a.assetName}{a.calibration ? " ·📏" : ""}
          </button>
        ))}
        <button className="chip" onClick={() => {
          const n = prompt(`New ${tax.assetNoun.toLowerCase()} name`, `${tax.assetNoun} ${insp.assets.length + 1}`);
          if (n) setActiveAsset(inspection.addAsset(n));
        }}>+ {tax.assetNoun}</button>
      </div>

      {/* Tool bar */}
      <div className="bar bar-bottom">
        {(["point", "line", "area", "note"] as MarkType[]).map((m) => (
          <button key={m} className={`chip ${mode === m ? "chip-on" : ""}`} onClick={() => { setMode(m); setCur([]); }}>
            {m === "point" ? "Pin" : m === "line" ? "Run" : m === "area" ? "Zone" : "Note"}
          </button>
        ))}
        <label className="chip">
          <input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> Stamp
        </label>
        {stamp && mode === "point" && (
          <select className="select" value={stampKey} onChange={(e) => setStampKey(e.target.value)}>
            {tax.defects.filter((x) => x.defaultType === "point").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        )}
        <button className="chip" onClick={() => setCalib("pick")}>{cal ? "Recalibrate" : "Calibrate"}</button>
        <span className="muted small">{assetMarks} marks</span>
        <button className="btn btn-primary" onClick={() => router.push("/report")}>Finish</button>
      </div>

      {/* Mark form */}
      {pending && (
        <div className="sheet">
          <p className="h3">{fNoteOnly ? "Note" : "Classify finding"}</p>
          {!fNoteOnly && (
            <>
              <label className="field">Defect
                <select className="select" value={fDefect} onChange={(e) => {
                  setFDefect(e.target.value);
                  const d = findDefect(tax, e.target.value); if (d) setFSev(d.defaultSeverity);
                }}>
                  {tax.defects.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}
                </select>
              </label>
              <label className="field">Quantity {pending.calc != null && <span className="muted small">engine: {pending.calc}</span>}
                <input className="input" type="number" step="0.01" min="0" value={fQty} onChange={(e) => setFQty(parseFloat(e.target.value) || 0)} />
              </label>
            </>
          )}
          <div className="field">Severity
            <div className="sev-row">
              {([1, 2, 3, 4, 5] as Severity[]).map((s) => (
                <button key={s} className={`sev ${fSev === s ? "sev-on" : ""}`} style={{ borderColor: SEVERITY_COLOURS[s] }} onClick={() => setFSev(s)}>
                  {s} <span className="small">{SEVERITY_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="field">Note
            <textarea className="input" rows={2} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Optional detail for the report" />
          </label>
          {mode !== "note" && (
            <label className="small"><input type="checkbox" checked={fNoteOnly} onChange={(e) => setFNoteOnly(e.target.checked)} /> Note only (not a classified defect)</label>
          )}
          <div className="row">
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitForm}>Save</button>
          </div>
        </div>
      )}

      {/* Calibration */}
      {calib === "pick" && (
        <div className="sheet">
          <p className="h3">Calibrate {asset.assetName}</p>
          <p className="muted small">Measurements only apply to this {tax.assetNoun.toLowerCase()}. Recalibrate when distance or zoom changes.</p>
          <div className="grid2">
            {[...tax.references, ...Object.keys(REFERENCE_OBJECTS).filter((k) => !tax.references.includes(k))].map((k) => (
              <button key={k} className="btn" onClick={() => { setRefKey(k); setBoxFrac(REFERENCE_OBJECTS[k].width < 0.3 ? 0.15 : 0.4); setCalib("box"); }}>
                {REFERENCE_OBJECTS[k].label}
              </button>
            ))}
            <button className="btn" onClick={() => { setRefKey("custom"); setBoxFrac(0.4); setCalib("box"); }}>Custom size</button>
            {source.kind === "image" && <button className="btn" onClick={() => setCalib("gsd")}>Drone GSD (nadir)</button>}
          </div>
          <div className="row">
            {cal && <button className="btn" onClick={() => { inspection.setCalibration(activeAsset, null); setCalib(null); }}>Clear</button>}
            <button className="btn" onClick={() => setCalib(null)}>Close</button>
          </div>
        </div>
      )}
      {calib === "box" && (
        <div className="sheet sheet-slim">
          <p className="small">{refKey === "custom" ? "Size the box to a known object, then enter its width." : REFERENCE_OBJECTS[refKey]?.hint}</p>
          <div className="row">
            <button className="chip" onClick={() => setBoxFrac((f) => Math.max(0.03, f - 0.02))}>−</button>
            <input type="range" min={0.03} max={0.95} step={0.005} value={boxFrac} onChange={(e) => setBoxFrac(parseFloat(e.target.value))} />
            <button className="chip" onClick={() => setBoxFrac((f) => Math.min(0.95, f + 0.02))}>+</button>
          </div>
          {refKey === "custom" && <input className="input" placeholder="Width in metres" value={customM} onChange={(e) => setCustomM(e.target.value)} />}
          <div className="row">
            <button className="btn" onClick={() => setCalib("pick")}>Back</button>
            <button className="btn btn-primary" onClick={lockBox}>Lock</button>
          </div>
        </div>
      )}
      {calib === "gsd" && (
        <div className="sheet">
          <p className="h3">Ground sample distance</p>
          <p className="muted small">Nadir shots over flat ground only. Use a reference object for oblique shots.</p>
          <label className="field">Altitude AGL (m)
            <input className="input" value={gsd.altitude} onChange={(e) => setGsd({ ...gsd, altitude: e.target.value })} />
          </label>
          <label className="field">Sensor
            <select className="select" value={gsd.sensor} onChange={(e) => setGsd({ ...gsd, sensor: e.target.value })}>
              {Object.entries(DRONE_SENSORS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <div className="row">
            <button className="btn" onClick={() => setCalib("pick")}>Back</button>
            <button className="btn btn-primary" onClick={lockGsd}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
