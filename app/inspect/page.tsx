"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MarkupCanvas from "@/components/MarkupCanvas";
import { useInspection } from "@/lib/store";

function Inspect() {
  const router = useRouter();
  const params = useSearchParams();
  const insp = useInspection();
  const source = params.get("source") ?? "live";
  const mediaId = params.get("id") ?? undefined;
  const name = params.get("name") ?? undefined;
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  if (!insp) {
    return (
      <div className="center-screen">
        <div className="card"><p className="h3">No active inspection</p>
          <button className="btn btn-primary" onClick={() => router.push("/")}>Start one</button></div>
      </div>
    );
  }

  if (source === "file" && !fileUrl) {
    return (
      <div className="center-screen">
        <div className="card stack">
          <p className="h3">Pick an image</p>
          <input type="file" accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFileUrl(URL.createObjectURL(f));
          }} />
          <button className="btn" onClick={() => router.push("/")}>Back</button>
        </div>
      </div>
    );
  }

  if (source === "live") return <MarkupCanvas insp={insp} source={{ kind: "live" }} />;
  if (source === "media" && mediaId) {
    return <MarkupCanvas key={mediaId} insp={insp}
      source={{ kind: "image", url: `/api/media/file?id=${encodeURIComponent(mediaId)}`, mediaId, name }} />;
  }
  return <MarkupCanvas key={fileUrl} insp={insp} source={{ kind: "image", url: fileUrl!, name: "Local image" }} />;
}

export default function InspectPage() {
  return <Suspense><Inspect /></Suspense>;
}
