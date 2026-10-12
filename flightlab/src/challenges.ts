import { Vector3 } from 'three';
import type { Gate } from './types';

export function crossedGate(previous: Vector3, current: Vector3, gate: Gate): boolean {
  const from = previous.clone().sub(gate.position).dot(gate.normal);
  const to = current.clone().sub(gate.position).dot(gate.normal);
  if (from >= 0 || to < 0) return false;
  const fraction = -from / (to - from);
  const crossing = previous.clone().lerp(current, fraction).sub(gate.position);
  crossing.addScaledVector(gate.normal, -crossing.dot(gate.normal));
  return crossing.length() < gate.radius;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

export interface GhostFrame { t: number; p: number[]; q: number[] }
export interface FlightRecord { time: number; frames: GhostFrame[]; }
const RECORD_VERSION = 'flightlab.records.v1';

export function loadRecord(key: string): FlightRecord | null {
  try {
    const item = JSON.parse(localStorage.getItem(`${RECORD_VERSION}.${key}`) || 'null');
    if (!item || !Number.isFinite(item.time) || item.time <= 0 || !Array.isArray(item.frames) || item.frames.length > 18000) return null;
    if (!item.frames.every((f: GhostFrame) => Number.isFinite(f.t) && Array.isArray(f.p) && f.p.length === 3 && f.p.every(Number.isFinite) && Array.isArray(f.q) && f.q.length === 4 && f.q.every(Number.isFinite))) return null;
    return item;
  } catch { return null; }
}
export function saveRecord(key: string, record: FlightRecord): boolean {
  try { localStorage.setItem(`${RECORD_VERSION}.${key}`, JSON.stringify(record)); return true; }
  catch { return false; }
}
