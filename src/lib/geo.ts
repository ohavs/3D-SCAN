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
 * Generate capture targets spanning the whole sphere, in a guided capture *order*:
 * the horizon ring first (sweeping around from the front), then the ring above,
 * the ring below, then progressively higher/lower rings, and finally the ceiling
 * and floor. The UI guides the user to these one at a time, so the sequence is
 * what makes capture feel organised rather than scattered.
 *
 * `overlap` (0..1) controls how much neighbouring shots overlap — overlap is what
 * makes feather-blending seamless and the auto-capture reachable.
 */
export function generateTargets(
  hfovDeg: number,
  vfovDeg: number,
  overlap = 0.35,
): Target[] {
  const targets: Target[] = [];
  const latStep = vfovDeg * (1 - overlap) * DEG;
  const maxRingLat = (90 - vfovDeg * 0.5) * DEG;

  // Ring latitudes in capture order: equator, +1, -1, +2, -2, ...
  const ringLats: number[] = [0];
  for (let k = 1; k * latStep <= maxRingLat + 1e-3; k++) {
    ringLats.push(k * latStep, -k * latStep);
  }

  for (const lat of ringLats) {
    const cosLat = Math.max(0.15, Math.cos(lat));
    const lonStep = (hfovDeg * (1 - overlap) * DEG) / cosLat;
    const count = Math.max(3, Math.round((2 * Math.PI) / lonStep));
    // Sweep around starting from the front (lon = 0) in one consistent direction.
    for (let j = 0; j < count; j++) {
      const lon = (j / count) * 2 * Math.PI;
      const wrapped = lon > Math.PI ? lon - 2 * Math.PI : lon;
      targets.push({
        lon: wrapped,
        lat,
        dir: lonLatToDir(wrapped, lat),
        kind: 'ring',
      });
    }
  }

  // Poles last: ceiling (+90) then floor (-90).
  targets.push({
    lon: 0,
    lat: Math.PI / 2,
    dir: lonLatToDir(0, Math.PI / 2),
    kind: 'ceiling',
  });
  targets.push({
    lon: 0,
    lat: -Math.PI / 2,
    dir: lonLatToDir(0, -Math.PI / 2),
    kind: 'floor',
  });

  return targets;
}

/** Great-circle angle (radians) between two unit directions. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
