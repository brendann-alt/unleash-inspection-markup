import { NextResponse, type NextRequest } from "next/server";
import { uploadFrame } from "@/lib/unleash/upload";

/**
 * POST /api/media/upload  { dataUrl, name, location, deviceId? }
 * Pushes a clean captured frame into Media Drive via the S3 upload bucket.
 */
export async function POST(req: NextRequest) {
  try {
    const { dataUrl, name, location, deviceId } = (await req.json()) as {
      dataUrl: string; name: string; location: string; deviceId?: string;
    };
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl ?? "");
    if (!m) return NextResponse.json({ error: "Expected a JPEG data URL" }, { status: 400 });
    if (!name || !location) return NextResponse.json({ error: "name and location required" }, { status: 400 });
    const out = await uploadFrame({ jpeg: Buffer.from(m[1], "base64"), name, location, deviceId });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
