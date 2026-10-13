"use client";
/** Renders a clean frame with its marks drawn on top. Evidence for the report. */
import { useEffect, useRef } from "react";
import { drawShape, project } from "@/lib/markup/render";
import type { FrameRef, Mark } from "@/lib/markup/types";

export default function EvidenceImage({ frame, marks, highlight, className }: {
  frame: FrameRef; marks: Mark[]; highlight?: string[]; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const img = new Image();
    img.onload = () => {
      c.width = frame.width; c.height = frame.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const s = Math.max(1, frame.width / 900);
      for (const m of marks) {
        const dim = highlight && !highlight.includes(m.id);
        ctx.globalAlpha = dim ? 0.35 : 1;
        const measure = m.unit === "m" ? `${m.qty}m` : m.unit === "m2" ? `${m.qty}m²` : undefined;
        drawShape(ctx, project(m.points, frame.width, frame.height), { colour: m.colour, label: m.label, measure, scale: s });
      }
      ctx.globalAlpha = 1;
    };
    img.src = frame.cleanDataUrl;
  }, [frame, marks, highlight]);
  return <canvas ref={ref} className={className} style={{ width: "100%", height: "auto" }} />;
}
