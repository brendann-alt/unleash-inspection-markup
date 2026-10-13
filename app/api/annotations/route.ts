import { NextResponse, type NextRequest } from "next/server";
import { annotationMode, writeAnnotations } from "@/lib/unleash/annotations";
import type { AddonAnnotationPayload } from "@/lib/export/addon";

/** GET reports whether write-back is live, so the UI can show the right button. */
export async function GET() {
  return NextResponse.json({ mode: annotationMode() });
}

/** POST { mediaId, payload } writes this tool's annotations onto a Media Drive item. */
export async function POST(req: NextRequest) {
  try {
    const { mediaId, payload } = (await req.json()) as { mediaId: string; payload: AddonAnnotationPayload };
    if (!mediaId || !payload?.shapes) return NextResponse.json({ error: "mediaId and payload required" }, { status: 400 });
    const result = await writeAnnotations(mediaId, payload);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
