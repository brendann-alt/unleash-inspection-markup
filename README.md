# Unleash live Inspection Markup

Pin, measure and grade defects on a live phone camera or on drone imagery from Media Drive. Findings roll up per asset, ranked by severity. Export COCO for model training, or write annotations back to the Media Drive item under this tool's add-on id.

Built on the SwiftScope live site markup engine, re-pointed from quoting to inspection.

## Run it

```bash
cp .env.example .env.local   # add UL_PAT at minimum
npm install
npm run dev                  # camera needs HTTPS on a phone: npm run dev -- --experimental-https
npm test                     # measurement, aggregation, COCO and payload tests
```

## Structure

```
app/
  page.tsx                  Start: name, asset class, source (camera / Media Drive / local file)
  inspect/page.tsx          Markup workspace, picks the source
  media/page.tsx            Media Drive browser (images), opens one for markup
  report/page.tsx           Report, COCO export, upload, write-back
  api/media/route.ts        GET  list Media Drive images (GraphQL `list`)
  api/media/file/route.ts   GET  same-origin image proxy (keeps canvas untainted)
  api/media/upload/route.ts POST push field frames to the S3 upload bucket
  api/annotations/route.ts  GET mode / POST write annotations to a media item
components/
  MarkupCanvas.tsx          The engine: pin, run, zone, note, stamp, calibration
  EvidenceImage.tsx         Clean frame + marks rendered at view time
  InspectionReport.tsx      Per-asset findings with evidence, worst first
lib/
  markup/types.ts           Mark, Frame, Asset, Inspection (normalised coords)
  markup/measure.ts         Reference + GSD calibration, length, area, bbox
  markup/aggregate.ts       Marks -> findings (count/length/area, max severity)
  markup/render.ts          Shared canvas drawing
  taxonomy/index.ts         Powerline, solar, telecom, building defect sets
  export/coco.ts            COCO dataset (stable category ids)
  export/addon.ts           Per-media payload stored under the add-on id
  unleash/client.ts         Media Drive GraphQL client (server only)
  unleash/upload.ts         S3 upload with location/name/deviceid metadata
  unleash/annotations.ts    Write-back adapter (off until mutation confirmed)
  store.ts                  IndexedDB-backed inspection state
tests/markup.test.ts
```

## What came from SwiftScope

| SwiftScope (quotease repo)                 | Here                                   | Change |
|--------------------------------------------|----------------------------------------|--------|
| `app/camera/page.tsx` gestures, stamp mode | `components/MarkupCanvas.tsx`          | Pointer events, works on still images too |
| `TRADE_ITEMS`                              | `lib/taxonomy`                         | Defects with severity and stable COCO ids |
| `SpatialMeasurementEngine`                 | `lib/markup/measure.ts`                | Source-pixel maths, GSD, polygon area |
| `RoomSession` + per-room calibration       | `AssetSession`                         | Room becomes pole / string / tower / elevation |
| `aggregateLiveMarkupPins`                  | `lib/markup/aggregate.ts`              | Groups by asset + defect, keeps worst severity |
| `PricingEngine`                            | dropped                                | Severity ranking replaces price |
| `SiteAnnotationReport`                     | `components/InspectionReport.tsx`      | Evidence rendered live, not burned in |
| sessionStorage hand-off                    | `lib/store.ts` (IndexedDB)             | Full-res frames exceed the 5MB quota |

Key fix over the original: points are stored normalised to the source frame, not screen pixels, and letterboxing is accounted for. Required for COCO and for write-back to line up with the real image.

## Unleash live integration status

Confirmed against developer.unleashlive.com:

- PAT in the Authorization header
- Media Drive GraphQL at `mediadrive-api.unleashlive.com/graphql`, `list` and `get`
- Files at `library.unleashlive.com/<s3Path>`
- Uploads direct to the S3 upload bucket with `location`, `name`, `deviceid` metadata
- Item `annotations` is AWSJSON keyed by add-on id

Needs the platform team before production:

1. Exact GraphQL selection set for `list`/`get` (`ITEM_FIELDS` in `lib/unleash/client.ts`)
2. The mutation that writes `annotations` on an item. Set `UL_ANNOTATION_MUTATION` and `UL_ANNOTATION_MODE=graphql`
3. Upload bucket name and credentials
4. Whether the library CDN needs the PAT or a signed URL (`api/media/file`)
5. Add-on id to register this tool under (`UL_ADDON_ID`)

Until then the tool runs end to end in file mode: mark up, report, export COCO.

## Next

- Pull GPS/altitude from EXIF so GSD auto-fills
- Let the AI add-on's existing detections load as editable marks (review mode)
- Offline queue for uploads from site
