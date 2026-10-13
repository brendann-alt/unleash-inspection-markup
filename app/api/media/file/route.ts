import { type NextRequest } from "next/server";
import { getMedia, cdnUrl } from "@/lib/unleash/client";

/**
 * GET /api/media/file?id=<mediaId>
 *
 * Same-origin proxy for Media Drive images. Drawing a cross-origin image onto
 * a canvas taints it and toDataURL() throws, which would break frame capture
 * and COCO export. Serving through here keeps the canvas clean.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new Response("id required", { status: 400 });
  try {
    const { get: item } = await getMedia(id);
    if (!item?.s3Path) return new Response("No s3Path on item", { status: 404 });
    const upstream = await fetch(cdnUrl(item.s3Path), {
      headers: { Authorization: `Bearer ${process.env.UL_PAT ?? ""}` },
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) return new Response(`CDN ${upstream.status}`, { status: 502 });
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
