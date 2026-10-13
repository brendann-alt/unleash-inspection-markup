/**
 * Annotation write adapter.
 *
 * Media Drive returns `annotations` on an item as AWSJSON keyed by add-on id,
 * so inspection markup is stored under this tool's own add-on id
 * (UL_ADDON_ID) without touching annotations from other AI models.
 *
 * The public docs list only move/rename/delete as item mutations, so the
 * write path is pluggable:
 *   - "graphql": a mutation on Media Drive (set UL_ANNOTATION_MUTATION to the
 *     real mutation once confirmed with the platform team)
 *   - "file":    no write; the caller exports COCO/JSON instead (default)
 */
import "server-only";
import { mediaGraphql } from "./client";
import type { AddonAnnotationPayload } from "../export/addon";

export function annotationMode(): "graphql" | "file" {
  return process.env.UL_ANNOTATION_MODE === "graphql" ? "graphql" : "file";
}

export async function writeAnnotations(mediaId: string, payload: AddonAnnotationPayload) {
  const addonId = process.env.UL_ADDON_ID;
  if (!addonId) throw new Error("UL_ADDON_ID is not set");
  if (annotationMode() !== "graphql") {
    throw new Error("Annotation write is disabled (UL_ANNOTATION_MODE=file). Export COCO instead.");
  }
  const mutation = process.env.UL_ANNOTATION_MUTATION;
  if (!mutation) throw new Error("UL_ANNOTATION_MUTATION is not set. Add the confirmed Media Drive mutation.");
  // Expected variables: $id: String!, $addonId: String!, $annotations: AWSJSON!
  return mediaGraphql(mutation, { id: mediaId, addonId, annotations: JSON.stringify(payload) });
}
