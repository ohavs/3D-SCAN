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

export interface Target {
  readonly lon: number; // radians, [-PI, PI]
  readonly lat: number; // radians, [-PI/2, PI/2]
  readonly dir: Vec3; // unit world-space direction
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
 * Generate capture targets spanning the whole sphere. Targets are laid out in
 * latitude rings sized so neighbouring shots overlap by `overlap` (0..1) in both
 * axes — overlap is what makes feather-blending seamless. Zenith and nadir get a
 * single target each (the ceiling / floor shots).
 */
export function generateTargets(
  hfovDeg: number,
  vfovDeg: number,
  overlap = 0.4,
): Target[] {
  const targets: Target[] = [];
  const latStep = vfovDeg * (1 - overlap) * DEG;
  const maxRingLat = (90 - vfovDeg * 0.5) * DEG;

  // Number of rings between the poles (symmetric around the equator).
  const ringCount = Math.max(1, Math.round((2 * maxRingLat) / latStep));
  for (let i = 0; i <= ringCount; i++) {
    const lat = -maxRingLat + (i / ringCount) * (2 * maxRingLat);
    // Longitudinal spacing grows toward the poles (divide by cos lat).
    const cosLat = Math.max(0.15, Math.cos(lat));
    const lonStep = (hfovDeg * (1 - overlap) * DEG) / cosLat;
    const count = Math.max(3, Math.round((2 * Math.PI) / lonStep));
    // Offset alternate rings by half a step for a denser, brick-like coverage.
    const offset = i % 2 === 0 ? 0 : Math.PI / count;
    for (let j = 0; j < count; j++) {
      const lon = -Math.PI + (j / count) * 2 * Math.PI + offset;
      targets.push({ lon, lat, dir: lonLatToDir(lon, lat) });
    }
  }

  // Poles: ceiling (+90) and floor (-90).
  targets.push({ lon: 0, lat: Math.PI / 2, dir: lonLatToDir(0, Math.PI / 2) });
  targets.push({ lon: 0, lat: -Math.PI / 2, dir: lonLatToDir(0, -Math.PI / 2) });

  return targets;
}

/** Great-circle angle (radians) between two unit directions. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
