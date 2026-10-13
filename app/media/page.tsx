"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Item { id: string; name: string; s3Path?: string }

/** Browse Media Drive images and open one for markup. */
export default function MediaPage() {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true); setErr(null);
    const qs = new URLSearchParams({ limit: "48" });
    if (location) qs.set("location", location);
    if (!reset && next) qs.set("next", JSON.stringify(next));
    try {
      const res = await fetch(`/api/media?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setItems((prev) => (reset ? json.items : [...prev, ...json.items]));
      setNext(json.nextToken ?? null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="h1">Media Drive</h1>
        <div className="row">
          <button className="btn" onClick={() => router.push("/")}>Home</button>
          <button className="btn btn-primary" onClick={() => router.push("/report")}>Report</button>
        </div>
      </div>
      <div className="row">
        <input className="input" style={{ flex: 1 }} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location, e.g. teamId/folderId" />
        <button className="btn" onClick={() => load(true)} disabled={loading}>Load</button>
      </div>
      {err && <p className="card" style={{ color: "#dc2626" }}>{err}</p>}
      <div className="media-grid">
        {items.map((it) => (
          <button key={it.id} className="media-tile"
            onClick={() => router.push(`/inspect?source=media&id=${encodeURIComponent(it.id)}&name=${encodeURIComponent(it.name)}`)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/file?id=${encodeURIComponent(it.id)}`} alt="" loading="lazy" />
            <span>{it.name}</span>
          </button>
        ))}
      </div>
      {next != null && <button className="btn" onClick={() => load(false)} disabled={loading}>{loading ? "Loading" : "Load more"}</button>}
      {!loading && !err && items.length === 0 && <p className="muted">No images at this location.</p>}
    </main>
  );
}
