import { NextResponse, type NextRequest } from "next/server";
import { listMedia } from "@/lib/unleash/client";

/** GET /api/media?location=team/folder&limit=50&next=<json> : list Media Drive images. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const next = sp.get("next");
    const data = await listMedia({
      location: sp.get("location") ?? undefined,
      limit: Number(sp.get("limit") ?? 50),
      nextToken: next ? JSON.parse(next) : undefined,
    });
    return NextResponse.json(data.list);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
