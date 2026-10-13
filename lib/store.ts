"use client";
/**
 * Inspection store.
 *
 * SwiftScope handed marks between pages through sessionStorage. Inspection
 * frames are full-resolution JPEGs (a pole job can be 40+ frames), which blows
 * through the 5MB storage quota, so state lives in IndexedDB instead and
 * survives a refresh or a dropped signal in the field.
 */
import { useSyncExternalStore } from "react";
import { get, set, del } from "idb-keyval";
import type { AssetSession, Calibration, FrameRef, Inspection, Mark } from "./markup/types";

const KEY = "ul-inspection-current";

let state: Inspection | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

function persist() {
  if (state) void set(KEY, state).catch(() => {});
  else void del(KEY).catch(() => {});
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export async function loadInspection() {
  if (loaded) return;
  loaded = true;
  try { state = (await get<Inspection>(KEY)) ?? null; } catch { state = null; }
  emit();
}

function update(fn: (s: Inspection) => Inspection) {
  if (!state) return;
  state = fn(state);
  persist();
  emit();
}

export const inspection = {
  start(name: string, taxonomy: string, firstAsset: string) {
    state = {
      id: uid(), name, taxonomy, createdAt: new Date().toISOString(),
      assets: [{ assetId: uid(), assetName: firstAsset, calibration: null }],
      frames: {}, marks: [],
    };
    loaded = true;
    persist(); emit();
  },
  clear() { state = null; persist(); emit(); },
  addAsset(name: string): string {
    const a: AssetSession = { assetId: uid(), assetName: name, calibration: null };
    update((s) => ({ ...s, assets: [...s.assets, a] }));
    return a.assetId;
  },
  renameAsset(assetId: string, name: string) {
    update((s) => ({ ...s, assets: s.assets.map((a) => (a.assetId === assetId ? { ...a, assetName: name } : a)) }));
  },
  setCalibration(assetId: string, calibration: Calibration | null) {
    update((s) => ({ ...s, assets: s.assets.map((a) => (a.assetId === assetId ? { ...a, calibration } : a)) }));
  },
  addFrame(frame: FrameRef): string {
    const id = uid();
    update((s) => ({ ...s, frames: { ...s.frames, [id]: frame } }));
    return id;
  },
  addMark(mark: Mark) { update((s) => ({ ...s, marks: [...s.marks, mark] })); },
  updateMark(id: string, patch: Partial<Mark>) {
    update((s) => ({ ...s, marks: s.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  },
  removeMark(id: string) { update((s) => ({ ...s, marks: s.marks.filter((m) => m.id !== id) })); },
  /** Replace a frame's media id after a successful Media Drive upload. */
  linkFrameToMedia(frameId: string, mediaId: string) {
    update((s) => ({ ...s, frames: { ...s.frames, [frameId]: { ...s.frames[frameId], mediaId } } }));
  },
};

export function useInspection(): Inspection | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); void loadInspection(); return () => listeners.delete(l); },
    () => state,
    () => null,
  );
}
