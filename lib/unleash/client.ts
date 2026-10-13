/**
 * Unleash live server-side client. Never import this into a client component:
 * it reads the personal access token from the environment.
 *
 * Confirmed from the public developer docs (developer.unleashlive.com):
 *   - Auth: personal access token in the Authorization header
 *   - Media Drive: single GraphQL endpoint, POST {MEDIADRIVE}/graphql
 *     with `list` and `get` queries
 *   - Files served from the library CDN at {LIBRARY_CDN}/<s3Path>
 *   - Uploads go straight to the S3 upload bucket with metadata keys
 *     location, name, deviceid
 *   - Item `annotations` is an AWSJSON string keyed by add-on id
 *
 * NOT in the public docs, so behind an adapter (see annotations.ts):
 *   - writing annotations back to a media item
 * Confirm the exact GraphQL selection set and the annotation write path
 * with the platform team before going to production.
 */
import "server-only";

const MEDIADRIVE = process.env.UL_MEDIADRIVE_URL ?? "https://mediadrive-api.unleashlive.com";
export const LIBRARY_CDN = process.env.UL_LIBRARY_CDN ?? "https://library.unleashlive.com";

function token() {
  const t = process.env.UL_PAT;
  if (!t) throw new Error("UL_PAT is not set. Create a personal access token in Unleash live and add it to .env.local");
  return t;
}

export async function mediaGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${MEDIADRIVE}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Media Drive ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

export interface MediaItem {
  id: string;
  name: string;
  type: string;
  s3Path?: string;
  createdDate?: number | string;
  location?: string;
  metadata?: Record<string, unknown>;
  annotations?: string;
}

/**
 * Selection set. Field names other than id/name/type/s3Path/location/
 * metadata/annotations are not documented publicly; trim or extend to
 * match the live schema.
 */
const ITEM_FIELDS = `id name type s3Path createdDate location metadata annotations`;

export async function listMedia(p: { location?: string; limit?: number; nextToken?: unknown; tags?: string[] }) {
  const q = `query List($location: String, $limit: Int, $nextToken: AWSJSON, $type: String, $sort: String, $tags: [String]) {
    list(location: $location, limit: $limit, nextToken: $nextToken, type: $type, sort: $sort, tags: $tags) {
      items { ${ITEM_FIELDS} }
      nextToken
    }
  }`;
  return mediaGraphql<{ list: { items: MediaItem[]; nextToken?: unknown } }>(q, {
    location: p.location, limit: p.limit ?? 50, nextToken: p.nextToken ? JSON.stringify(p.nextToken) : undefined,
    type: "I", sort: "desc", tags: p.tags,
  });
}

export async function getMedia(id: string) {
  const q = `query Get($item: LibraryUpdateInput!) { get(item: $item) { ${ITEM_FIELDS} } }`;
  return mediaGraphql<{ get: MediaItem }>(q, { item: { id } });
}

export function cdnUrl(s3Path: string) {
  return `${LIBRARY_CDN}/${s3Path.replace(/^\/+/, "")}`;
}
