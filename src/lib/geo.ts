/**
 * Equirectangular geometry helpers: direction <-> lon/lat, and generation of the
 * capture "targets" that guide the user across the full sphere (incl. poles).
 *
 * Direction convention (matches the accumulation shader and the spec):
 *   D = (cosLat * sinLon, sinLat, cosLat * cosLon)
 *   lon = atan2(D.x, D.z),  lat = asin(D.y)
 *   lon=0,lat=0 -> +Z ;  lat=+90 -> +Y (zenith/ceiling) ; lat=-90 -> nadir/floor
 */

import { Quat, quatRotateVec3, Vec3 } from './quaternion';

export const DEG = Math.PI / 180;

export type TargetKind = 'ring' | 'ceiling' | 'floor';
export type CaptureMode = 'rows' | 'columns';

export interface Target {
  readonly lon: number; // radians, [-PI, PI]
  readonly lat: number; // radians, [-PI/2, PI/2]
  readonly dir: Vec3; // unit world-space direction
  readonly kind: TargetKind;
}

export function lonLatToDir(lon: number, lat: number): Vec3 {
  const cl = Math.cos(lat);
  return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
}

export function dirToLonLat(d: Vec3): { lon: number; lat: number } {
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const lon = Math.atan2(d[0], d[2]);
  return { lon, lat };
}

/** Forward (look) direction of a camera->world quaternion. Camera looks down -Z. */
export function cameraForward(q: Quat): Vec3 {
  return quatRotateVec3(q, [0, 0, -1]);
}

/** Up direction of a camera->world quaternion. */
export function cameraUp(q: Quat): Vec3 {
  return quatRotateVec3(q, [0, 1, 0]);
}

/**
 * Generate capture targets spanning the whole sphere on a fixed lon/lat grid, in a
 * guided capture *order* chosen by `mode`:
 *  - 'rows':    sweep the whole horizon ring, then the ring above, then below, ...
 *  - 'columns': finish one vertical column (centre, up, down, up2, down2) before
 *               moving sideways to the next column.
 * Poles (ceiling/floor) come last in both. A fixed column count keeps columns
 * aligned across rings so the vertical sweep is clean.
 */
export function generateTargets(
  hfovDeg: number,
  vfovDeg: number,
  mode: CaptureMode = 'rows',
  overlap = 0.2,
): Target[] {
  const latStep = vfovDeg * (1 - overlap) * DEG;
  const maxRingLat = (90 - vfovDeg * 0.5) * DEG;

  // Latitudes in fill order: equator, +1, -1, +2, -2, ...
  const lats: number[] = [0];
  for (let k = 1; k * latStep <= maxRingLat + 1e-3; k++) {
    lats.push(k * latStep, -k * latStep);
  }

  const lonStep = hfovDeg * (1 - overlap) * DEG;
  const lonCount = Math.max(3, Math.round((2 * Math.PI) / lonStep));

  const make = (lat: number, j: number): Target => {
    let lon = (j / lonCount) * 2 * Math.PI;
    if (lon > Math.PI) lon -= 2 * Math.PI;
    return { lon, lat, dir: lonLatToDir(lon, lat), kind: 'ring' };
  };

  const out: Target[] = [];
  if (mode === 'columns') {
    for (let j = 0; j < lonCount; j++) {
      for (const lat of lats) out.push(make(lat, j));
    }
  } else {
    for (const lat of lats) {
      for (let j = 0; j < lonCount; j++) out.push(make(lat, j));
    }
  }

  out.push({
    lon: 0,
    lat: Math.PI / 2,
    dir: lonLatToDir(0, Math.PI / 2),
    kind: 'ceiling',
  });
  out.push({
    lon: 0,
    lat: -Math.PI / 2,
    dir: lonLatToDir(0, -Math.PI / 2),
    kind: 'floor',
  });
  return out;
}

/** Great-circle angle (radians) between two unit directions. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
