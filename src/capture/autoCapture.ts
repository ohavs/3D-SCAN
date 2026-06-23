/**
 * Auto-capture targeting: find the nearest unfilled target to where the camera is
 * pointing, and decide when alignment is good enough to fire the shutter.
 */

import { Target, angleBetween, cameraForward } from '../lib/geo';
import { Quat } from '../lib/quaternion';

export const ALIGN_THRESHOLD_RAD = (7 * Math.PI) / 180; // aligned within 7°
export const HIGHLIGHT_RANGE_RAD = (45 * Math.PI) / 180; // show nearby targets

export interface NearestResult {
  index: number;
  angle: number; // radians to that target
}

export function nearestTarget(
  forward: readonly [number, number, number],
  targets: Target[],
  done: ReadonlySet<number>,
): NearestResult {
  let best = -1;
  let bestAngle = Infinity;
  for (let i = 0; i < targets.length; i++) {
    if (done.has(i)) continue;
    const a = angleBetween(forward, targets[i]!.dir);
    if (a < bestAngle) {
      bestAngle = a;
      best = i;
    }
  }
  return { index: best, angle: bestAngle };
}

/** Convenience: nearest target directly from a camera->world quaternion. */
export function nearestFromQuat(
  q: Quat,
  targets: Target[],
  done: ReadonlySet<number>,
): NearestResult {
  return nearestTarget(cameraForward(q), targets, done);
}

export interface ShutterDecision {
  shouldFire: boolean;
  aligned: boolean;
}

/**
 * Decide whether to fire. Requires the nearest target to be within threshold and
 * the device to be reasonably still (small angular change since last frame).
 */
export function evaluateShutter(
  nearest: NearestResult,
  angularSpeedRad: number,
  maxAngularSpeed = 0.25, // rad/s — "holding steady"
): ShutterDecision {
  const aligned = nearest.index >= 0 && nearest.angle <= ALIGN_THRESHOLD_RAD;
  return {
    aligned,
    shouldFire: aligned && angularSpeedRad <= maxAngularSpeed,
  };
}
